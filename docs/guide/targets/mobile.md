
# Mobile
Mobile builds are intended to be installed on a user's mobile device. These builds are accessible from the home screen, and have access to native features.

Commoners relies on [Capacitor](https://capacitorjs.com) to generate the necessary files for a mobile application. To enable this feature, simply add the `--target mobile` flag to your build command.

One peculiar aspect of Capacitor is that mobile builds **require Capacitor plugins to be explicitly listed in your `package.json` file**, even if installed in `node_modules`.

## CI / Headless Builds

When `CI=true` (set automatically by GitHub Actions and most CI providers), commoners skips `npx cap open` and completes without launching a native IDE. This allows mobile builds to run headlessly in CI pipelines.

You can also force headless mode locally:
```bash
# Using the CLI flag
commoners build --target ios --headless

# Using the environment variable
CI=true commoners build --target android
```

After a headless build, the native project files are ready at:
- **iOS**: `ios/` (open with Xcode or compile with `xcodebuild`)
- **Android**: `android/` (open with Android Studio or compile with `./gradlew assembleDebug`)

For CI workflow templates, see the [Build Automation](/guide/build-automation#mobile) documentation.

## iOS
If you are building for iOS, you will need [Xcode](https://apps.apple.com/us/app/xcode/id497799835?mt=12) installed on your Mac. 

### Ruby
1. Install [Homebrew](https://brew.sh)
2. Install `chruby` and `ruby-install` (`brew install chruby ruby-install`)
3. Install and activate a different version of Ruby (`ruby-install ruby 3.3.0` and `chruby 3.3.0`)

#### Tested Ruby Versions
- Ruby 3.3.0

### Environment Configuration
An older version of CocoaPods may be required to build the project using Capacitor.

Try running the following command to install CocoaPods:
```bash
sudo gem install cocoapods:1.10.2
```

### Publishing to TestFlight
Publishing your application requires [Apple Developer Program](https://developer.apple.com/programs/) membership.

> #### App Store Connect Integration
> To interact with the App Store Connect API, you'll need to create an API key in the App Store Connect dashboard. This key will be used to authenticate with the API and upload your build.
> - Go to [App Store Connect](https://appstoreconnect.apple.com)
> - Click on "Users and Access", "Integrations", then "App Store Connect API"
> - Click on the "+" button to create a new API key
> - Provide a name, then select "Developer" access.
> - You'll then need the `Issuer ID` and `Key ID` from the key you just created
> - Finally, download the API key and store it in a secure location

Before we begin, you'll need to collect a range of different environment variables. These include:
1. `APPLE_ID` - Your Apple ID email address
2. `APPLE_TEAM_ID` - Your Apple Developer Team ID (found in the Membership Details section of your [account](https://developer.apple.com/account))
3. `APP_STORE_CONNECT_API_KEY_ISSUER_ID` - The `Issuer ID` from the App Store Connect API key
4. `APP_STORE_CONNECT_API_KEY_ID` - The `Key ID` from the App Store Connect API key
5. `APP_STORE_CONNECT_API_KEY_KEY` - The contents of the App Store Connect API key, copied using `openssl pkcs8 -nocrypt -in path/to/key.p8 | pbcopy`
6. `APP_BUNDLE_IDENTIFIER` - The bundle identifier of your app (e.g. `com.example.app`)
7. `APP_ID` - The App ID of your app
8. `TEMP_KEYCHAIN_USER` - The username for the temporary keychain
9. `TEMP_KEYCHAIN_PASSWORD` - The password for the temporary keychain
10. `CERTIFICATE_STORE_REPO` - The repository containing your certificates (from Fastlane Match)
11. `GIT_USERNAME` - Your GitHub username
12. `GIT_TOKEN` - A GitHub token with access to the repository containing your certificates
13. `APP_STORE_CONNECT_TEAM_ID` - Your [App Store Connect Team ID](https://sarunw.com/posts/fastlane-find-team-id/)
14. `MATCH_PASSWORD` - The password for your Fastlane Match

#### Manual Publishing
Coming soon...

<!-- NOTE: Removing documentation on Fastlane because of inability to solve https://github.com/fastlane/fastlane/issues/20670 -->
<!-- ###### Workflow Configuration
Configuring a Github Actions workflow will allow you to automate the build and upload process.

1. Copy the `Gemfile` and `fastlane` folder from the [commoners-starter-kit](https://github.com/garrettmflynn/commoners-starter-kit/tree/main/fastlane) repository into your project

2. Install [fastlane](https://docs.fastlane.tools/getting-started/ios/setup/) (e.g `brew install fastlane`)
    1. Run [fastlane match init](https://docs.fastlane.tools/actions/match/) with Git Storage (Option #1).
    2. Run `fastlane match appstore` to create your certificates

3. Set all environment variables declared above as GitHub Actions Secrets
    - `APPLE_ID` - Your Apple ID email address
    - `APPLE_TEAM_ID` - Your Apple Developer Team ID (found in the Membership Details section of your [account](https://developer.apple.com/account))
    - `APP_STORE_CONNECT_API_KEY_ISSUER_ID` - The `Issuer ID` from the App Store Connect API key
    - `APP_STORE_CONNECT_API_KEY_ID` - The `Key ID` from the App Store Connect API key
    - `APP_STORE_CONNECT_API_KEY_KEY` - The contents of the App Store Connect API key
        - **Note:** Can be copied using `openssl pkcs8 -nocrypt -in path/to/key.p8 | pbcopy`
    - `APP_BUNDLE_IDENTIFIER` - The bundle identifier of your app (e.g. `com.example.app`)
    - `APP_ID` - The App ID of your app
    - `TEMP_KEYCHAIN_USER` - The username for the temporary keychain
    - `TEMP_KEYCHAIN_PASSWORD` - The password for the temporary keychain
    - `CERTIFICATE_STORE_REPO` - The repository containing your certificates (from Fastlane Match)
    - `GIT_USERNAME` - Your GitHub username
    - `GIT_TOKEN` - A GitHub token with access to the repository containing your certificates
    - `APP_STORE_CONNECT_TEAM_ID` - Your [App Store Connect Team ID](https://sarunw.com/posts/fastlane-find-team-id/)
    - `MATCH_PASSWORD` - The password for your Fastlane Match

4. Copy the iOS build workflow from the [commoners-starter-kit](https://github.com/garrettmflynn/commoners-starter-kit/tree/main/.github/workflows/ios.yml) into your project

5. Manually trigger the workflow to ensure that everything is working as expected!

###### Local Publishing
Place all the aforementioned environment variables in a `./fastlane/.env` file . 

Then run the following command to publish your app:
```bash
bundle exec fastlane closed_beta
``` -->

## Testing

Commoners supports two modes for mobile testing:

### Web Preview Testing (Default)

In testing and CI environments, mobile builds are served via a Vite preview server instead of opening a native IDE. Playwright connects to the preview URL and runs the same E2E tests used for web/PWA targets. This covers all JavaScript, services, pages, plugins, and DOM behavior without requiring Xcode, Android Studio, or any native tooling.

This mode activates automatically when any of these conditions are true:
- `__COMMONERS_TESTING` is set (via `@commoners/testing`)
- `CI=true` (GitHub Actions, etc.)
- `COMMONERS_HEADLESS=true`

What this tests:
- `commoners.MOBILE === true` flag
- `commoners.PAGES` navigation
- `commoners.PLUGINS` messaging
- `commoners.SERVICES` HTTP integration
- `commoners.ENV` environment variables
- All web DOM/JavaScript behavior

### Native Emulator Testing (Future)

For full native coverage including Capacitor plugins, native UI, and device APIs, emulator-based testing is planned:

**Android:**
- Use [`ReactiveCircus/android-emulator-runner`](https://github.com/ReactiveCircus/android-emulator-runner) GitHub Action
- Appium or WebDriverIO for WebView automation
- `./gradlew connectedAndroidTest` for instrumented tests

**iOS:**
- Use `macos-latest` runner with iOS Simulator
- XCUITest or Appium for native UI testing
- [`@onslip/automation`](https://github.com/niclas-niclas/niclas-niclas) for WebView testing in native containers

**Cost considerations:**
- macOS runners: ~$0.08/min
- Typical run: 5-15 minutes
- Recommend manual trigger (`workflow_dispatch`) for native tests to control costs

What native testing adds beyond web preview:
- Native Capacitor plugin behavior (camera, filesystem, etc.)
- Native UI rendering (status bar, gestures)
- App lifecycle events (suspend/resume)
- Actual emulator/device behavior

## Android
If you are building for Android, you will need to install the following dependencies:
- [Android Studio](https://developer.android.com/studio)
