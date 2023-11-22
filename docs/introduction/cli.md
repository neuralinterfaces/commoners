# CLI Commands

## Main Commands
### commoners
Run your project in development mode. 

### commoners build
Build the project assets.
- `--outDir [path]` - The output directory for the build (`string`)
- `--publish [condition]` - Publish a release of your application to GitHub on the provided condition ([`string`](https://www.electron.build/configuration/publish.html#how-to-publish)) (`--desktop` only)
    - **Note:** While [other providers](https://www.electron.build/configuration/publish.html#publishers) are possible to use, they have not been tested with this command.

#### Service Selection
- `--target services` - Build only the services
- `--no-services` - Skip building services

### commoners launch
Launch your built application.
- `--outDir [path]` - The output directory of the build to launch (`string`)

### commoners share
Share the application's services—or simply run them on their own.
- `--port` - The port to use for the service gateway (`number`). Can also use the `COMMONERS_SHARE_PORT` environment variable.
- `--service [name]` - For specific service(s) (`string`)

## Shared Options
Many CLI commands for `commoners` share a similar options structure:

### Target Platform (`commoners` / `build` / `launch`)
Specify the target platform for the command.
- `--target [target]`
    - `web` - Default option
        - `pwa` - As a Progressive Web App (`build` only)
    - `desktop` - For your current desktop platform (`boolean`/ `string`)
        - `electron` - Build with Electron
        - `tauri` - Build with Tauri (TBD)
    - `mobile` - For the mobile platform corresponding to your build enviroment 
        - `ios` - For iOS (`ios` only)
        - `android` - For Android
    

### Service Selection (`commoners` / `build` / `share`)
- `--service [name]` - Apply action to **specific service(s)** (`string`). Can be used multiple times.