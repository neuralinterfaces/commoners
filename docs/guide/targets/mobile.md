
# Mobile
Mobile builds are intended to be installed on a user's mobile device. These builds are accessible from the home screen, and have access to native features.

Commoners relies on [Capacitor](https://capacitorjs.com) to generate the necessary files for a mobile application. To enable this feature, simply add the `--target mobile` flag to your build command.

One peculiar aspect of Capacitor is that mobile builds **require Capacitor plugins to be explicitly listed in your `package.json` file**, even if installed in `node_modules`.

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

## Android
If you are building for Android, you will need to install the following dependencies:
- [Android Studio](https://developer.android.com/studio)
