# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
Coming soon...

## [0.0.48]
### Added
- Added a global `commoners.dev` property for reliably detecting whether a build is running in development mode. Replaces Vite's `import.meta.env.DEV` property, which was unreliable for mobile development.
- Infer the `launch` target using the configuration file if not provided as an argument

### Changed
- Fixed the `--share` command after updating the project root definition
- Updated the Bluetooth plugin to allow for matching Bluetooth devices by name without manual user selection
- Simplified the Capacitor peer dependency management by requiring users to handle the installation themselves
- Fixed building for mobile without plugins
- Update service configuration to allow for more uniform service definitions
- Removed `[build]` argument option to avoid inconsistent behavior when running outside of your project root
- Dynamically encode asset paths to avoid issues with `.commoners/assets` scoping when including assets outside the project root
- Improved CLI formatting and error handling

## [0.0.47]
### Changed
- Updated dependencies to fix security vulnerabilities
- Updated documentation and README to better describe the project and its goals

## [0.0.46]

### Changed
- Correct for platform-specific service file conventions (e.g. `.exe` on Windows vs. no extension on `Mac`) to properly check for existence
- Fixed misuse of hardcoded Unix separators (e.g. when running on Windows) during the service start process

## [0.0.45]

### Added
- This CHANGELOG file.

### Changed
- Fixed the `--publish` CLI argument to work without any arguments after the flag.

[Unreleased]: https://github.com/neuralinterfaces/commoners/compare/v0.0.48...HEAD
[0.0.48]: https://github.com/neuralinterfaces/commoners/compare/v0.0.47...v0.0.48
[0.0.47]: https://github.com/neuralinterfaces/commoners/compare/v0.0.46...v0.0.47
[0.0.46]: https://github.com/neuralinterfaces/commoners/compare/v0.0.45...v0.0.46
[0.0.45]: https://github.com/neuralinterfaces/commoners/compare/v0.0.44...v0.0.45