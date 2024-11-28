# CLI Commands

## Main Commands
### commoners [root]
Run your project in development mode. 
- `[root]` - The root directory of the project (`string`)

### commoners build [root]
Build the project assets.
- `[root]` - The root directory of the project (`string`)
- `--outDir [path]` - The output directory for the build (`string`)

#### Desktop Builds
- `--publish [condition]` - Publish a release of your application to GitHub on the provided condition ([`string`](https://www.electron.build/configuration/publish.html#how-to-publish))
    - **Note:** While [other providers](https://www.electron.build/configuration/publish.html#publishers) are possible to use, they have not been tested with this command.

##### Mac
- `--sign` - Enable code signing (`--target desktop` on Mac only). Will be automatically enabled with `--publish`

#### Service Selection
- `--service [name]` - Build a specific service. Can use multiple times. (`string`)

### commoners launch [path]
Launch your built application.
- `[path]` - The output directory of the build to launch (`string`)

## Shared Options
### Target Platform (`commoners` / `build` / `launch`)
Specify the target platform for the command.
- `--target [target]`
    - `web` - Default option
        - `pwa` - As a Progressive Web App (`build` only)
    - `desktop` - For your current desktop platform (`boolean`/ `string`)
        - `electron` - Build with Electron
    - `mobile` - For the mobile platform corresponding to your build enviroment 
        - `ios` - For iOS (only available on macOS)
        - `android` - For Android