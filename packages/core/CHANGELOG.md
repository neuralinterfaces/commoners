# Changelog

All notable changes to this project will be documented in this file.

## 0.1.0
### Added
- Allow for popup window configuration, bundling, and runtime control in plugins.

### Changed
- Fix test workflow and launch commands for Windows and partial Linux support.
- Fixed Desktop and PWA builds in custom output directories
- Separated testing utilities from `vitest` for use with any testing framework.
- Ensure Electron process is exiting on Windows using Ctrl+C.
- Removed `share` command
- Ensured proper manual service builds by using the `publish` option to determine build location
