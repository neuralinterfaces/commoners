# Build Automation
Using GitHub Actions, you can automatically build and publish your application to web, desktop, and mobile platforms.

The [Commoners Starter Kit](https://github.com/neuralinterfaces/commoners-starter-kit) repository provides ready-to-use workflow templates for all supported platforms. You can scaffold a project with the same structure using `pnpm create commoners`, then copy the workflows you need.

## Web
A template workflow for publishing your application to GitHub Pages is provided in the [Commoners Starter Kit](https://github.com/neuralinterfaces/commoners-starter-kit/blob/main/.github/workflows/Build-and-deploy-pwa.yml) repository.

## Desktop
A set of template workflows for publishing your application to GitHub Releases is provided in the [Commoners Starter Kit](https://github.com/neuralinterfaces/commoners-starter-kit/blob/main/.github/workflows) repository.

This includes separate workflows for Windows, macOS, and Linux.

## Mobile
Commoners automatically detects CI environments (via the `CI` environment variable set by GitHub Actions and other CI providers) and skips opening native IDEs during mobile builds. This makes `commoners build --target ios` and `commoners build --target android` work headlessly in CI pipelines.

You can also force headless mode locally with `--headless` or by setting `COMMONERS_HEADLESS=true`.

After the headless build completes, the native project is synced and ready for compilation using platform-specific tooling (Gradle for Android, xcodebuild for iOS).

### Android
The [Commoners Starter Kit](https://github.com/neuralinterfaces/commoners-starter-kit/blob/main/.github/workflows/Build-mobile-android.yml) includes a workflow that:

1. Runs on `ubuntu-latest` with JDK 17 and Android SDK
2. Runs `pnpm build -- --target android` (headless in CI)
3. Compiles a debug APK with `./gradlew assembleDebug`
4. Uploads the APK as a build artifact (14-day retention)

This workflow triggers on pushes to `main` and can also be triggered manually.

### iOS
The [Commoners Starter Kit](https://github.com/neuralinterfaces/commoners-starter-kit/blob/main/.github/workflows/Build-mobile-ios.yml) includes a workflow that:

1. Runs on `macos-latest`
2. Runs `pnpm build -- --target ios` (headless in CI)
3. Installs CocoaPods dependencies
4. Compiles with `xcodebuild` using `CODE_SIGNING_ALLOWED=NO` for unsigned validation

This workflow uses `workflow_dispatch` (manual trigger only) to control costs, since macOS runners are billed at 10x the rate of Linux runners.

For signed iOS builds and TestFlight distribution, see the [Mobile Targets](/guide/targets/mobile) documentation.
