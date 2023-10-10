# CLI Commands
The CLI commands for `commoners` share the same options structure:

- `--web` - Default option (`boolean`)

- `--desktop` - For your current desktop platform (`boolean`)
    - `--mac` - For Mac
    - `--windows` - For Windows
    - `--linux` - For Linux

- `--mobile` - For the mobile platform corresponding to your build enviroment (`boolean`)
    - `--ios` - For iOS
    - `--android` - For Android

- `--frontend` - Frontend resources only (`boolean`)
- `--services` - All services defined in the configuration file (`boolean`)
- `--service [name]` - For specific service(s) (`string`)

## commoners
Start your project in development mode 

## commoners build
Build the project assets

### Additional Options
- `--pwa` - As a Progressive Web App
- `--desktop --publish [condition]` - Publish a release of your application to GitHub on the provided condition ([`string`](https://www.electron.build/configuration/publish.html#how-to-publish))
    - **Note:** While [other providers](https://www.electron.build/configuration/publish.html#publishers) are possible to use, they have not been tested with this command.

## commoners launch
Launch your built application

> **Note:** No service-related options available for this command

## commoners share
Share the application's services
- `--port` - The port to use for the service gateway (`number`)
- `--service [name]` - For specific service(s) (`string`)

> **Note:** To be shared, you must internally configure your service to be hosted on `0.0.0.0` rather than `localhost`.