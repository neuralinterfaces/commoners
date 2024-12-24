# Changelog

All notable changes to this project will be documented in this file.

## 0.1.0
### Added
- Allow for popup window configuration, bundling, and runtime control in plugins.

### Changed
- Always emit CJS files when executing in a Node.js environment.
- Fixed Desktop and PWA builds in custom output directories
- Separated testing utilities from `vitest` for use with any testing framework.
- Ensure Electron process is exiting on Windows using Ctrl+C.
- Removed `share` command
- Ensure proper service `publish` configuration
    - Ensured proper manual service builds by using the `publish` option to determine build location
- Support HTML-only multi-page applications using inbuilt Vite features.
- Allow launching built services from the command line using `commoners launch`.

## Fixes
- Fix multi-page workflow when using a `vite.config.js` file.
- Fix test workflow and launch commands for Windows and partial Linux support.

