import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

/**
 * CLI configuration stored at ~/.config/budget/config.json.
 */
export interface Config {
  defaultCurrency?: string
}

/**
 * Get the config directory path.
 */
export function getConfigDir(): string {
  return process.env.BUDGET_CONFIG_DIR || join(homedir(), '.config', 'budget')
}

/**
 * Get the config file path.
 */
export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json')
}

/**
 * Load config from disk. Returns defaults if file doesn't exist.
 */
export function loadConfig(): Config {
  const configPath = getConfigPath()
  if (!existsSync(configPath)) {
    return {}
  }
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'))
  } catch {
    return {}
  }
}

/**
 * Save config to disk.
 */
export function saveConfig(config: Config): void {
  const configDir = getConfigDir()
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2) + '\n')
}

/**
 * Get the default currency from config, or 'USD' if not set.
 */
export function getDefaultCurrency(): string {
  return loadConfig().defaultCurrency || 'USD'
}

/**
 * Set the default currency in config.
 */
export function setDefaultCurrency(currency: string): void {
  const config = loadConfig()
  config.defaultCurrency = currency
  saveConfig(config)
}
