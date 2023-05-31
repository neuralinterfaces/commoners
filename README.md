# commoners
 A CLI for Commoners


## Project Structure
The CLI will output a `.commoners` subfolder with built files for your application.

As such, you'll need to specify `"main": "./.commoners/dist/main/index.js"` in your `package.json` to ensure that it can find your Electron dev build.

## Stable Commands
- `commoners build` - Build the project into a certain format

## Notes
- Only support ESM projects
- Allow Typescript 