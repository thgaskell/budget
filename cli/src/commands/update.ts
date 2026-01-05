import { Command } from 'commander'
import { createWriteStream, unlinkSync, chmodSync, renameSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { outputSuccess, outputError, colors, type OutputOptions } from '../output.ts'
import pkg from '../../package.json'

/**
 * GitHub release asset information.
 */
interface GitHubAsset {
  name: string
  browser_download_url: string
}

/**
 * GitHub release response structure.
 */
interface GitHubRelease {
  tag_name: string
  body: string
  assets: GitHubAsset[]
}

/**
 * GitHub API configuration.
 */
const GITHUB_API_URL = 'https://api.github.com/repos/thgaskell/budget/releases/latest'

/**
 * Get the current version from package.json.
 */
function getCurrentVersion(): string {
  return pkg.version
}

/**
 * Fetch the latest release information from GitHub.
 */
async function getLatestRelease(): Promise<GitHubRelease> {
  const response = await fetch(GITHUB_API_URL, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'budget-cli',
    },
  })

  if (response.status === 403) {
    throw new Error('GitHub API rate limit reached. Try again later.')
  }

  if (!response.ok) {
    throw new Error('Unable to check for updates. Check your internet connection.')
  }

  return response.json() as Promise<GitHubRelease>
}

/**
 * Compare two semantic versions.
 * Returns true if `latest` is newer than `current`.
 */
function isNewerVersion(current: string, latest: string): boolean {
  // Strip 'v' prefix if present
  const currentClean = current.replace(/^v/, '')
  const latestClean = latest.replace(/^v/, '')

  const currentParts = currentClean.split('.').map(Number)
  const latestParts = latestClean.split('.').map(Number)

  // Compare major, minor, patch
  for (let i = 0; i < 3; i++) {
    const currentPart = currentParts[i] || 0
    const latestPart = latestParts[i] || 0

    if (latestPart > currentPart) {
      return true
    }
    if (latestPart < currentPart) {
      return false
    }
  }

  return false
}

/**
 * Get the binary name for the current platform and architecture.
 */
function getPlatformBinaryName(): string {
  const platform = process.platform
  const arch = process.arch

  // Map Node.js platform names to our asset naming convention
  let platformName: string
  switch (platform) {
    case 'darwin':
      platformName = 'darwin'
      break
    case 'linux':
      platformName = 'linux'
      break
    case 'win32':
      platformName = 'windows'
      break
    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }

  // Map Node.js arch names to our asset naming convention
  let archName: string
  switch (arch) {
    case 'arm64':
      archName = 'arm64'
      break
    case 'x64':
      archName = 'x64'
      break
    default:
      throw new Error(`Unsupported architecture: ${arch}`)
  }

  const baseName = `budget-${platformName}-${archName}`
  return platform === 'win32' ? `${baseName}.exe` : baseName
}

/**
 * Download a binary from a URL to a destination path with progress display.
 */
async function downloadBinary(url: string, destPath: string): Promise<void> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`)
  }

  const totalSize = Number(response.headers.get('content-length')) || 0
  let downloadedSize = 0

  const fileStream = createWriteStream(destPath)

  // Use readable stream from response body
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Failed to get response body reader')
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      fileStream.write(Buffer.from(value))
      downloadedSize += value.length

      // Show progress if we know the total size
      if (totalSize > 0 && process.stdout.isTTY) {
        const percent = Math.round((downloadedSize / totalSize) * 100)
        process.stdout.write(`\r  ${percent}% downloaded...`)
      }
    }

    // Clear the progress line
    if (process.stdout.isTTY) {
      process.stdout.write('\r' + ' '.repeat(30) + '\r')
    }
  } finally {
    fileStream.end()
  }

  // Wait for the file to be fully written
  await new Promise<void>((resolve, reject) => {
    fileStream.on('finish', resolve)
    fileStream.on('error', reject)
  })
}

/**
 * Install a new binary, backing up the old one first.
 */
async function installBinary(tempPath: string, targetPath: string): Promise<void> {
  const backupPath = `${targetPath}.backup`

  console.log(colors.dim('  Backing up current binary...'))

  // Create backup of current binary if it exists
  if (existsSync(targetPath)) {
    try {
      renameSync(targetPath, backupPath)
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err.code === 'EACCES') {
        throw new Error('Permission denied. Try: sudo budget update')
      }
      throw error
    }
  }

  console.log(colors.dim('  Installing new version...'))

  try {
    // Move new binary to target location
    renameSync(tempPath, targetPath)

    // Make executable (not needed on Windows)
    if (process.platform !== 'win32') {
      chmodSync(targetPath, 0o755)
    }

    // Remove backup on success
    if (existsSync(backupPath)) {
      unlinkSync(backupPath)
    }
  } catch (error) {
    // Restore backup on failure
    if (existsSync(backupPath)) {
      try {
        renameSync(backupPath, targetPath)
      } catch {
        // Best effort restore
      }
    }

    const err = error as NodeJS.ErrnoException
    if (err.code === 'EACCES') {
      throw new Error('Permission denied. Try: sudo budget update')
    }
    throw error
  }
}

/**
 * Prompt user for confirmation.
 */
async function promptConfirmation(message: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close()
      const normalized = answer.toLowerCase().trim()
      resolve(normalized === 'y' || normalized === 'yes')
    })
  })
}

/**
 * Check if running from a compiled binary vs source.
 */
function isCompiledBinary(): boolean {
  // When running as a compiled Bun binary, process.execPath points to the binary itself
  // When running from source via "bun run", it points to the Bun runtime
  const execPath = process.execPath.toLowerCase()
  return !execPath.includes('bun') || execPath.includes('budget')
}

/**
 * Get the path to the current binary.
 */
function getBinaryPath(): string {
  // process.argv[0] is the binary path when running compiled
  // process.execPath is more reliable for Bun compiled binaries
  return process.argv[0]
}

/**
 * Register update commands.
 */
export function registerUpdateCommands(program: Command): void {
  program
    .command('update')
    .description('Check for updates and optionally install the latest version')
    .option('--check', 'Only check for updates, do not install')
    .option('--force', 'Skip confirmation prompt')
    .action(async (opts: { check?: boolean; force?: boolean }) => {
      const options = program.opts() as OutputOptions

      try {
        const currentVersion = getCurrentVersion()
        console.log(`Current version: ${currentVersion}`)
        console.log('Checking for updates...')
        console.log()

        // Fetch latest release from GitHub
        let release: GitHubRelease
        try {
          release = await getLatestRelease()
        } catch (error) {
          const err = error as Error
          outputError(err, options)
          return
        }

        // Extract version from tag (remove 'v' prefix for display)
        const latestVersion = release.tag_name.replace(/^v/, '')

        // Check if update is needed
        if (!isNewerVersion(currentVersion, release.tag_name)) {
          console.log(colors.success(`You are running the latest version (${currentVersion})`))
          return
        }

        console.log(colors.info(`New version available: ${latestVersion}`))
        console.log()

        // Show release notes if available
        if (release.body && release.body.trim()) {
          console.log(colors.bold('Changes:'))
          // Indent release body
          const indentedBody = release.body
            .split('\n')
            .map((line) => `  ${line}`)
            .join('\n')
          console.log(indentedBody)
          console.log()
        }

        // If --check flag, stop here
        if (opts.check) {
          return
        }

        // Check if running from compiled binary
        if (!isCompiledBinary()) {
          console.log(
            colors.warning(
              'Running from source. Update is only available for compiled binaries.'
            )
          )
          console.log(
            colors.dim('To update, run: git pull && bun install')
          )
          return
        }

        // Find the correct asset for this platform
        const binaryName = getPlatformBinaryName()
        const asset = release.assets.find((a) => a.name === binaryName)

        if (!asset) {
          outputError(
            new Error(
              `No binary available for your platform (${process.platform}-${process.arch})`
            ),
            options
          )
          return
        }

        // Prompt for confirmation unless --force is specified
        if (!opts.force) {
          const confirmed = await promptConfirmation('Download and install? [y/N] ')
          if (!confirmed) {
            console.log(colors.dim('Update cancelled.'))
            return
          }
        }

        console.log()
        console.log(`Downloading ${binaryName}...`)

        // Download to temp file
        const tempPath = join(tmpdir(), `budget-update-${Date.now()}`)
        try {
          await downloadBinary(asset.browser_download_url, tempPath)
        } catch (error) {
          // Clean up temp file on failure
          if (existsSync(tempPath)) {
            unlinkSync(tempPath)
          }
          throw error
        }

        console.log('Installing...')

        // Install the new binary
        const targetPath = getBinaryPath()
        try {
          await installBinary(tempPath, targetPath)
        } catch (error) {
          // Clean up temp file on failure
          if (existsSync(tempPath)) {
            unlinkSync(tempPath)
          }
          throw error
        }

        console.log()
        outputSuccess(`Successfully updated to ${latestVersion}!`, options)
      } catch (error) {
        outputError(error as Error, options)
      }
    })
}
