# commoners
[![Npm package version](https://badgen.net/npm/v/commoners)](https://npmjs.com/package/commoners)
[![Npm package monthly downloads](https://badgen.net/npm/dm/commoners)](https://npmjs.ccom/package/commoners)

 The `commoners` CLI **allows anyone to build their application for web, desktop, and mobile** without the fuss of additional languages or libraries (e.g. Dart, React, etc.).

Read the [documentation](https://commoners.dev) to learn more.

## Key Projects
- [Commoners Starter Kit](https://github.com/neuralinterfaces/commoners-starter-kit) — A template Commoners app with all the bells and whistles.
- [tqdm.me](https://github.com/neuralinterfaces/tqdm.me) —  View your `tqdm` progress bars anywhere.
- [Brains@Play](https://github.com/neuralinterfaces/brainsatplay) — A multi-platform application for accessing neural data.

## Local Development
Use `npm i` to install all dependencies into the monorepo's workspaces.

### Core
#### Testing
Before testing, you'll have to run `npm run build` in the root directory.

### CLI
To get started with the CLI, you'll need to use `npm link` to connect it with the `@commoners/solidarity` package in `packages/core`:
```
cd packages/core
npm link
cd ../cli
npm link @commoners/solidarity
```

You'll only have to do this once.

After this, you can then install `commoners` globally from the `packages/cli` directory:

```
npm install -g .
```

## Acknowledgements
This project is part of [Neural Interfaces](https://github.com/neuralinterfaces).