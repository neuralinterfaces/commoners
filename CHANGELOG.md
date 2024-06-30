# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/neuralinterfaces/commoners/compare/v0.0.47...HEAD
[0.0.47]: https://github.com/neuralinterfaces/commoners/compare/v0.0.47...HEAD
[0.0.46]: https://github.com/neuralinterfaces/commoners/compare/v0.0.45...v0.0.46
[0.0.45]: https://github.com/neuralinterfaces/commoners/compare/v0.0.44...v0.0.45