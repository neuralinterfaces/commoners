# Features
Key features of Commoners.

## Build Targets
Commoners relies on [Vite](https://vitejs.dev) to generate the essential frontend files for each build target.

### Web
Web builds are the default build target. These builds are intended to be deployed to a web server, and are accessible from any device with a web browser.

#### PWA
Progressive Web Apps (PWAs) are web applications that can be installed on a device and accessed from the home screen. PWAs are supported on most modern browsers, and can be installed on both desktop and mobile devices—though they will have limited access to native features.

Commoners relies on [vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa) to generate the necessary files for a PWA. To enable this feature, simply add the `--target pwa` flag to your build command.

### Desktop
Desktop builds are intended to be installed on a user's computer. These builds are accessible from the desktop, and have access to native features.

Commoners relies on [Electron](https://www.electronjs.org) to generate the necessary files for a desktop application. To enable this feature, simply add the `--target desktop` flag to your build command.

#### Mac
While code-signing, you may recieve a `CSSMER_TP_CERT_REVOKED` error, which will cause a `The application "X" can't be opened` error to appear when attempting to open the app.

To circumvent this, [provide an appropriate certificate on your machine](https://developer.apple.com/help/account/create-certificates/create-developer-id-certificates/)—or update the `electron-builder` options in your configuration file to ignore code-signing:

```js
export default {
    // ...
    electron: {
        build: {
            mac: {
                identity: null
            }
        }
    }
    // ...
}
```

##### Workflow Configuration
To ensure that your Mac builds are code-signed, you'll need to create a Github Actions workflow to automate the build process. This will require you to define a set of secrets for `@electron/notarize`, namely `APPLE_ID`, `APPLE_ID_PASSWORD`, and `APPLE_TEAM_ID`.

1. `APPLE_ID` - Your Apple ID email address
2. `APPLE_ID_PASSWORD` - An app-specific password generated from your Apple ID account
3. `APPLE_TEAM_ID` - Your Apple Developer Team ID (found in the Membership Details section of your [account](https://developer.apple.com/account))

Additionally, you'll need to supply the `p12-file-base64` and `p12-password` values expected by the `apple-actions/import-codesign-certs@v2` action. These are the base64-encoded contents of your `.p12` file and the password used to encrypt it, respectively.

> **Note:** To copy the contents of your `.p12` file, you can use the following command: `base64 /path/to/certificate.p12 | pbcopy`

### Mobile
Mobile builds are intended to be installed on a user's mobile device. These builds are accessible from the home screen, and have access to native features.

Commoners relies on [Capacitor](https://capacitorjs.com) to generate the necessary files for a mobile application. To enable this feature, simply add the `--target mobile` flag to your build command.

#### iOS
If you are building for iOS, you will need [Xcode](https://apps.apple.com/us/app/xcode/id497799835?mt=12) installed on your Mac. 

##### Ruby
1. Install [Homebrew](https://brew.sh)
2. Install `chruby` and `ruby-install` (`brew install chruby ruby-install`)
3. Install and activate a different version of Ruby (`ruby-install ruby 3.3.0` and `chruby 3.3.0`)

###### Tested Ruby Versions
- Ruby 3.3.0

##### Environment Configuration
An older version of CocoaPods may be required to build the project using Capacitor.

Try running the following command to install CocoaPods:
```bash
sudo gem install cocoapods:1.10.2
```

##### Publishing to TestFlight
Publishing your application requires [Apple Developer Program](https://developer.apple.com/programs/) membership.

> ###### App Store Connect Integration
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

###### Manual Publishing
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

#### Android
If you are building for Android, you will need to install the following dependencies:
- [Android Studio](https://developer.android.com/studio)

### Root Declaration
If you'd like to run a Commoners project but aren't at the base, you can run the CLI with an input path. 

```bash
commoners /path/to/project
```

### Builds
Pairing the concepts of a root declaration and a target build, you can specify multiple builds of a single project using the `builds` property in your [Configuration File](./config.md).

```js
export default {
    builds: {
        web: './builds/main',
        desktop: './builds/desktop',
        mobile: './builds/mobile'
    }
}
```

These can be triggered identically to the root declaration:

```bash
commoners desktop
```

If you're not inside the project root, you'll specify _both_ the root and the build target:

```bash
commoners /path/to/project desktop
```

Notably, this project structure allows you to declare a `commoners.config.js` file for each build target, which will inherit from the configuration file at the project root (if specified).

## Services
Services are independent processes that the main application depends on. These may be `local` or `remote` based on the distributed application files.

> **Note:** Commoners currently supports `.js`, `.ts`, `.py`, `.exe`, and `.pkg` services.

To declare a service, you simply add the source file path to the `commoners.config.js` file:
```js
export default {
    services: {
        test: './services/test/index.ts'
    },
}
```

To use a service, you should (1) check for the existence of the service, then (2) instantiate the appropriate URL from the `commoners` global object:

```js
    if ('test' in COMMMONERS.services) {
        const url = new URL(commoners.services.test.url)
        // ....
    }
```

If your service will be accessible from a particular URL, you'll want to make sure that the `port` used is derived from the `PORT` environment variable:

```js
const port = process.env.PORT || 3000
```

### Using Services in Production
Service configurations may be different between development and production. For instance, `.py` services are commonly packaged using `pyinstaller`, which will output an `.exe` / `.pkg` file that includes all dependencies.

The following service structure would be used to handle this case:
```json
{
    "src": "src/main.py",
    "publish": {
        "build": {
            "mac": "python -m PyInstaller --name test --onedir --clean ./src/main.py --distpath ./dist/pyinstaller",
        },
        "local": {
            "src": "./dist/pyinstaller/test/test"
        }
    }
}
```

> **Note:** You must refrain from using the same `--name` argument as your `--distpath` final directory, as PyInstaller uses the `[distpath]/../[name]` directory to store temporary files.

## Plugins
Plugins are collections of JavaScript functions that run at different points during app initialization. These points include:

1. `load` - After the DOM is loaded 
2. `desktop.preload` - Immediately on Electron main process instantiation (`--desktop` builds only)
2. `desktop.load` - When Electron app is ready (`--desktop` builds only)

> **Note:** Official plugins can be found in the `@commoners` namespace on NPM, and are listed in the [official plugins](/plugins/official) section.

To declare a plugin, you simply add the relevant configuration object in the `plugins` array of your [Configuration File](./config.md) file:
```js
export default {
    plugins: [
        {
            name: 'selective-builds',
            isSupported: {
                web: {
                    load: false
                }
            },
            load: () => console.log(commoners.target + ' build (load)'),
            desktop: {
                load: () => console.log('desktop build (load)'),
                preload: () => console.log('desktop build (load)')
            }
        }
    ]
}
```

To use a plugin, you should check for the existence of the plugin, which *may* have a return value stored in the `plugins` property:

```js
    if ('test' in COMMMONERS.plugins) {
        const loaded = COMMMONERS.plugins.test
        // ....
    }
```

Global variables will be loaded from your `.env` file (if present). which you can use in `desktop` load functions.