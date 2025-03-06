# Changelog

All notable changes to this project will be documented in this file.

## 0.1.0
### Added
- Provide a `start`, `ready`, and `quit` callback on plugins across all targets (note: dev only for web and mobile).
- Added `PAGES` global variable to simplify navigation on multi-page applications.
- Allow for popup window configuration, bundling, and runtime control in plugins.

### Changed
- Handle each `target` for the start command independently
- Specify `public` directly instead of complete control over the `host` for services.
- Handle `isSupported` queries per feature on the plugin. 
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
- Properly run cleanup handlers when Electron is closed via dock.
- Only trigger Electron plugins when the frontend is loaded. 
- Fix multi-page workflow when using a `vite.config.js` file.
- Fix test workflow and launch commands for Windows and partial Linux support.
- Fix inclusion of environment files across different builds to maintain consistency with Vite behaviors.
