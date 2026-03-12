
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

## Windows
Windows builds require code signing to avoid SmartScreen warnings and to enable auto-update signature verification. Commoners validates your signing environment before the build starts, so you get clear error messages instead of cryptic failures.

### Certificate Types
| Type | SmartScreen | Cost | Use Case |
|------|-------------|------|----------|
| **EV Code Signing** | Immediate reputation | ~$300+/yr | Production releases |
| **OV Code Signing** | Builds reputation over time | ~$100+/yr | Production releases |
| **Self-signed (.pfx)** | Blocked by SmartScreen | Free | Local testing only |

For production, obtain a code signing certificate from a trusted CA (DigiCert, Sectigo, GlobalSign, etc.). EV certificates provide immediate SmartScreen reputation; OV certificates require building reputation through downloads.

### Environment Variables
Set these environment variables before building:

| Variable | Required | Description |
|----------|----------|-------------|
| `WIN_CSC_LINK` | Yes | Path or HTTPS URL to your `.pfx` certificate file |
| `WIN_CSC_KEY_PASSWORD` | Recommended | Password for the `.pfx` file |

> **Note:** `CSC_LINK` also works as a fallback if `WIN_CSC_LINK` is not set.

### Building a Signed App
```bash
# Set certificate environment variables
export WIN_CSC_LINK="/path/to/certificate.pfx"
export WIN_CSC_KEY_PASSWORD="your-password"

# Build with signing enabled
commoners build --target desktop --sign
```

Without `--sign` or `--publish`, code signing is disabled automatically — no certificate environment variables are needed for unsigned development builds.

### Configuration
You can customize Windows-specific electron-builder options in your config:

```js
export default {
    electron: {
        build: {
            win: {
                // Override the default timestamp server
                rfc3161TimeStampServer: 'http://timestamp.digicert.com',
                // Custom signing tool path
                sign: './scripts/custom-sign.js',
            },
            nsis: {
                oneClick: false,
                allowToChangeInstallationDirectory: true,
            },
        },
    },
}
```

### ASAR Integrity
When signing is enabled, Commoners automatically embeds ASAR integrity hashes into the Windows executable. This uses `rcedit` (installed automatically as an optional dependency). For advanced use cases, `ffi-napi` and `ref-napi` can also be installed for direct Windows API resource writing.

To disable ASAR integrity validation:
```js
export default {
    electron: {
        security: {
            asarIntegrity: false,
        },
    },
}
```

### SmartScreen Reputation
New OV certificates start with zero SmartScreen reputation. Users will see a "Windows protected your PC" warning until enough downloads establish trust. To avoid this:
- Use an **EV certificate** for immediate reputation
- Sign and timestamp every release consistently
- Submit your app to [Microsoft for analysis](https://www.microsoft.com/en-us/wdsi/filesubmission)

### Self-signed Certificate (Testing Only)
For local testing, generate a self-signed `.pfx`:

```powershell
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=My Test Cert"
$pwd = ConvertTo-SecureString -String "test1234" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath ".\test-cert.pfx" -Password $pwd
```

Then set:
```bash
set WIN_CSC_LINK=.\test-cert.pfx
set WIN_CSC_KEY_PASSWORD=test1234
commoners build --target desktop --sign
```

### Workflow Configuration
To automate signed Windows builds in GitHub Actions, store your certificate and password as repository secrets:

1. **`WIN_CSC_LINK`** — Base64-encoded contents of your `.pfx` file. Encode it with:
   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("certificate.pfx")) | clip
   ```
2. **`WIN_CSC_KEY_PASSWORD`** — The password for your `.pfx` file

See [Build Automation](../build-automation) for complete workflow templates.
