# Commoners
[![Npm package version](https://badgen.net/npm/v/commoners)](https://npmjs.com/package/commoners)
[![Npm package monthly downloads](https://badgen.net/npm/dm/commoners)](https://npmjs.ccom/package/commoners)

 The `commoners` CLI allows anyone to build their application as a Progressive Web App (PWA); Mac, Windows, and Linux desktop application; and iOS and Android mobile application—all using only HTML, CSS, and JavaScript.

Read the [documentation](https://commoners.dev) to learn more.

## Key Projects
- [Commoners Starter Kit](https://github.com/neuralinterfaces/commoners-starter-kit) — A template Commoners app with all the bells and whistles.
- [tqdm.me](https://github.com/neuralinterfaces/tqdm.me) —  View your `tqdm` progress bars anywhere.
- [Brains@Play](https://github.com/neuralinterfaces/brainsatplay) — A multi-platform application for accessing neural data.

## Build Solidarity
At the heart of Commoners is our belief that everyone should be able to write an application using HTML, CSS, and JavaScript for distribution on all platforms.

We use the term **build solidarity** to indicate the alignment of the world's web developers on a consistent architecture to achieve this goal.

Let's build solidarity together!

## Local Development
You will need to have [Node.js](https://nodejs.org/en/) installed on your machine.

This repository uses PNPM for package management. Install PNPM by running the following command:
```bash
npm install -g pnpm
```

Install all packages by running the following command:
```bash
pnpm install
```

### Linking to Local `commoners` Package
If you are working on the `commoners` package locally, you may need to link to some of its packages. Use the following template to link to a package (e.g. `@commoners/bluetooth`):
```bash
pnpm link ~/Documents/Github/commoners/packages/plugins/devices/ble
```

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