# Changelog

Each package maintains its own changelog:

- **[@budget/cli](./cli/CHANGELOG.md)** - Command-line interface
- **[@budget/core](./core/CHANGELOG.md)** - Core library
- **[@budget/webapp](./webapp/CHANGELOG.md)** - Web application

## Adding Changes

When making changes, add entries to the `[Unreleased]` section of the appropriate package changelog under the correct category:

- **Added** - New features
- **Changed** - Changes in existing functionality
- **Deprecated** - Soon-to-be removed features
- **Removed** - Removed features
- **Fixed** - Bug fixes
- **Security** - Vulnerability fixes

## Releasing

Run the release script to:
1. Move `[Unreleased]` entries to new version sections
2. Bump package versions
3. Build CLI binaries
4. Create GitHub release

---

_Historical unified releases (v0.1.0 - v0.3.0) have been migrated to package-specific changelogs._
