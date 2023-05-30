# commoners
 A CLI for Commoners


## Project Structure
### Automatic Updates + User Overrides
- `tauri.conf.js` — Your Tauri configuration 
- `Cargo.toml` — A secondary configuration for Tauri

> **Note:** Tauri configuration files cannot be placed in a hidden folder (e.g. `.commoners`) since these are not resolved by the Tauri compiler.

## Stable Commands
- `commoners build` - Build the project into a certain format

## Notes
- Only support ESM projects
- Allow Typescript 