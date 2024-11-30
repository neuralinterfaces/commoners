
# Desktop
Desktop builds are intended to be installed on a user's computer. These builds are accessible from the desktop, and have access to native features.

Commoners relies on [Electron](https://www.electronjs.org) to generate the necessary files for a desktop application. To enable this feature, simply add the `--target desktop` flag to your build command.

## Mac
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

### Workflow Configuration
To ensure that your Mac builds are code-signed, you'll need to create a Github Actions workflow to automate the build process. This will require you to define a set of secrets for `@electron/notarize`, namely `APPLE_ID`, `APPLE_ID_PASSWORD`, and `APPLE_TEAM_ID`.

1. `APPLE_ID` - Your Apple ID email address
2. `APPLE_ID_PASSWORD` - An app-specific password generated from your Apple ID account
3. `APPLE_TEAM_ID` - Your Apple Developer Team ID (found in the Membership Details section of your [account](https://developer.apple.com/account))

Additionally, you'll need to supply the `p12-file-base64` and `p12-password` values expected by the `apple-actions/import-codesign-certs@v2` action. These are the base64-encoded contents of your `.p12` file and the password used to encrypt it, respectively.

> **Note:** To copy the contents of your `.p12` file, you can use the following command: `base64 /path/to/certificate.p12 | pbcopy`
