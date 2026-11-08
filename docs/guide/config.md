# Configuration
> **Note:** A `commoners.config.[ts|js]` file is required for proper resolution of [Plugins](../guide/plugins), which cannot be used with an inline configuration file loaded into the `@commoners/solidarity` API.

The `commoners.config` file is used to configure your application's services, plugins, and more. 

This is merged with the `package.json` file (e.g. `name`, `version`, etc.) to resolve the final configuration of your application.

## Common Configuration Options
### Name
The `name` property defines the name of your application. This value is used as the default `<title>` of your application and as the Electron application name.

```js
export default {
    name: 'My App',
}
```

### Icon
The `icon` property defines the path to the icon of your application.

```js
export default {
    icon: './icon.png',
}
```

**Recommended:** Use a single **RGBA PNG** (color type 6) at **1024x1024** pixels. This is the universal format that works across all targets:

| Target | What happens | Notes |
|--------|-------------|-------|
| **Web** | Used as favicon | Any PNG works |
| **PWA** | Manifest icons | Vite PWA plugin handles sizing |
| **Electron** | App icon | electron-builder auto-converts to ICO/ICNS |
| **Tauri** | App + resource icon | Must be RGBA PNG (indexed PNGs are rejected at compile time) |
| **iOS** | App icon | Needs 1024x1024 source for all AppIcon sizes |
| **Android** | Launcher icon | Needs high-res source for mipmap generation |

**Common issues:**
- **Indexed PNGs** (color type 3) fail on Tauri. Use RGBA (color type 6).
- **Small icons** may look pixelated on high-DPI displays. Use 512x512 minimum.
- You can provide light/dark variants: `icon: { light: './icon-light.png', dark: './icon-dark.png' }`

### Pages
The `pages` property defines the pages of your application. This value is a proxy for `vite.build.rollupOptions.input` and specifies which HTML files in your application should be built.

```js
export default {
    pages: {
        index: './src/index.html',
        about: './src/about.html',
    },
}
```


### Plugins
The `plugins` property defines the plugins of your application. This value is used to configure the plugins of your application.

```js
export default {
    plugins: {
        'commoners-plugin': {
            load: () => {
                console.log('Plugin loaded!')
            }
        },
    },
}
```

More information on plugins can be found in the [Plugins](../guide/plugins) documentation.

### Services
The `services` property defines the services of your application. This value is used to configure the services of your application.

```js
export default {
    services: {
        node: './src/services/server.ts',
    },
}
```

More information on services can be found in the [Services](./services/index) documentation.

### Target
The `target` property defines the target of your application. This value is used to **change the default type of application** for the development and build commands.

```js
export default {
    target: 'desktop',
}
```

## Additional Properties
### Output Directory
The `outDir` property defines the output directory of your application. This value is used as the immediate location for any build artifacts.

> **Note:** Left unspecified, the application output directory is automatically defined as a `target`-specific subdirectory in the `.commoners` directory.

```js
export default {
    outDir: 'dist',
}
```

The `outDir` property can also be specified for each build using the `--outDir` flag in the `build` command.

```sh
commoners build --outDir dist
```

### App ID
The `appId` property defines the unique identifier of your application. This value is used as the default `appId` of your application and as the Electron application identifier.

```js
export default {
    appId: 'com.example.myapp',
}
```

If not specified, the `appId` is `com.` followed by the `name` in lowercase letters and digits (`My App` becomes `com.myapp`). Set it explicitly before you ship: it is the macOS bundle id, the Windows app id, the Tauri identifier and the mobile application id, so changing it later changes where the app's data and settings are stored.

### Port
The `port` property defines the port of your application when using the `start` or `launch` command for the `web` target.

```js
export default {
    target: 'desktop',
    outDir: 'dist',
    port: 3000
}
```

### Build
The `build` property defines the build options of your application that aren't covered by the standard configuration.

```js
export default {
    target: 'desktop',
    outDir: 'dist',
    build: {
        publish: true,
        sign: false
    },
}
```

These can also be specified for each build using the `--publish` and `--sign` flags in the `build` command.

```sh
commoners build --publish --no-sign
```


### Electron
The `electron` property defines the Electron options of your application. This value is used to configure the Electron options of your application.

```js
export default {
    electron: {
        nodeIntegration: true,
        window: {
            width: 800,
            height: 600,
        },
    },
}
```

#### `electron.build`
Pass any [electron-builder configuration](https://www.electron.build/configuration) directly. Your values are merged with the Commoners defaults, with your config taking precedence.

```js
export default {
    electron: {
        build: {
            appId: 'com.example.myapp',
            win: {
                target: ['nsis', 'portable'],
                rfc3161TimeStampServer: 'http://timestamp.digicert.com',
            },
            mac: {
                target: ['dmg', 'zip'],
                category: 'public.app-category.developer-tools',
            },
            nsis: {
                oneClick: false,
                allowToChangeInstallationDirectory: true,
            },
        },
    },
}
```

#### `electron.security`
Configure security features for the Electron build.

```js
export default {
    electron: {
        security: {
            // Enable or disable ASAR integrity validation (default: true when signing)
            asarIntegrity: true,

            // Or pass options:
            // asarIntegrity: { strict: true },

            // Disable ASAR integrity entirely:
            // asarIntegrity: false,
        },
    },
}
```

When `build.sign` or `build.publish` is enabled, ASAR integrity hashes are automatically embedded into the application binary and verified at runtime via Electron fuses. See [Desktop Targets](./targets/desktop) for platform-specific signing details.

#### `electron.origin`
Where packaged pages load from. The default, `'app'`, serves them from `app://local` through a protocol handler in the main process. `'file'` loads them from `file://` instead:

```js
export default {
    electron: { origin: 'file' }, // Opt out of app://local
    security: { crossOriginIsolation: true }, // Optional: SharedArrayBuffer on Electron too (needs 'app')
}
```

With `'app'`:

- Pages have a real origin (`app://local`) instead of `file://`, so `'self'` in the CSP means the app's own files.
- The CSP is sent as a response header, so header-only directives such as `frame-ancestors` apply.
- `security.crossOriginIsolation` takes effect on Electron, as it does on the web and Tauri: responses carry COOP/COEP/CORP and `crossOriginIsolated` is `true`.
- Only files inside the packaged app are served. A `file://` page can `fetch()` any file the user can read; an `app://local` page cannot. Paths that escape the app (`..`, encoded or not) return 404.

With `'file'`, the CSP can only be delivered as a `<meta>` tag, cross-origin isolation is unavailable, and page script can read local files.

Development is unchanged: the dev server already gives pages a real origin. The `app` scheme is reserved in `'app'` mode, so `electron.protocol` cannot also be `'app'`. Services see requests with `Origin: app://local` rather than `null`.

### Features
Declare which parts of your app each build includes. A feature is `true`/`false`, a function of `{ target, mode }`, or an object with `enabled` and optional `canaries`:

```js
export default {
    features: {
        export: { enabled: ({ target }) => target !== 'web', canaries: ['ExportPanel'] },
        diagnostics: false,
    },
}
```

Each feature becomes a build-time constant, `__COMMONERS_FEATURE_<NAME>__` (for example `__COMMONERS_FEATURE_EXPORT__`), so code behind `if (__COMMONERS_FEATURE_EXPORT__)` is removed from builds where the feature is off rather than skipped at runtime. `commoners.FEATURES` holds the resolved map.

**Canaries** are strings that only that feature's code contains. Production builds scan the frontend output, before any packaging: a disabled feature's canaries must be absent and an enabled feature's must be present (which proves the scan can see that code). Any violation fails the build and is reported in the [build record](#build-record). Source maps are scanned too, because a shipped map carries the original source.

### Build Record
Every production build writes three files describing what it contains, in `.commoners/records/<target>/`:

- `commoners.sbom.cdx.json`: a software bill of materials (SBOM) in [CycloneDX 1.5](https://cyclonedx.org) format. It lists the npm packages the bundler actually included (not everything in `package.json`), the desktop runtime (Electron, or Tauri's crates from its `Cargo.lock`), Rust crates and pinned Python requirements of your services, and each built service with its file hashes. It covers the [NTIA minimum elements](https://www.ntia.gov/report/2021/minimum-elements-software-bill-materials-sbom):
  - supplier, component name, version and a unique identifier (package URL) for each component;
  - the dependency relationships between components, as a CycloneDX dependency graph;
  - the SBOM's author and timestamp.

  Suppliers come from each npm package's `author` and each crate's `authors`. The app's own supplier and the SBOM author come from `author` in your `package.json`. Anything missing is listed in the manifest's `notCovered`, never guessed.
- `commoners.scan.sarif`: the build's scan results (feature canary violations and `eval`-like code the CSP would block) in [SARIF 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html), the format code-scanning tools read. A failed build writes only this file.
- `commoners.manifest.json`: the build's target, enabled `features` and their canary checks, security settings, the SHA-256 of every frontend, service and installer file, the source commit (with a flag if the working tree had uncommitted changes), and a `notCovered` list of anything the SBOM could not itemize, such as unpinned Python requirements.

**Test results.** Tests that exercise the built app usually run after the build, so their results are attached afterwards. Export them as JUnit XML (for example `vitest run --reporter=junit --outputFile=reports/e2e.xml`), then run:

```bash
commoners record-tests reports/e2e.xml --target electron
```

This writes `commoners.tests.json` next to the record: each report's SHA-256 and totals (tests, failures, errors, skipped), plus the hash of the manifest the tests ran against, so the results stay tied to that exact build. The command exits non-zero if any test failed.

The records sit outside the build output, so a web deployment does not publish its own SBOM. Set `SOURCE_DATE_EPOCH` to fix the timestamp, so identical inputs produce identical records.

```js
export default {
    buildRecord: { outDir: 'records' }, // Or false to turn it off
}
```

### Vite
The `vite` property defines the Vite options of your application. This value is used to configure the Vite options of your application.

```js
export default {
    vite: {
        server: {
            port: 3000,
        },
    },
}
```

This can also be specified using a `vite.config.js` file in the root of your project, or an alternative configuration file using the `vite` property.

```js
export default {
    vite: './config.vite.js',
}
```


<!-- ## PWA
The `pwa` property defines the PWA options of your application. This value is used to configure the PWA options of your application.


```js
export default {
    pwa: {
        includeAssets: ['favicon.ico'],
        manifest: {
            name: 'My App',
            short_name: 'My App',
            theme_color: '#ffffff',
            background_color: '#ffffff',
            display: 'standalone',
            start_url: '/',
            icons: [
                {
                    src: '/assets/icons/icon-192x192.png',
                    sizes: '192x192',
                    type: 'image/png',
                },
                {
                    src: '/assets/icons/icon-512x512.png',
                    sizes: '512x512',
                    type: 'image/png',
                },
            ],
        },
    }
}
``` -->
