# commoners
[![Npm package version](https://badgen.net/npm/v/commoners)](https://npmjs.com/package/commoners)
[![Npm package monthly downloads](https://badgen.net/npm/dm/commoners)](https://npmjs.ccom/package/commoners)

 The `commoners` CLI **allows anyone to build their application for web, desktop, and mobile** without the fuss of additional languages or libraries (e.g. Dart, React, etc.).

A complete example of a Commoners application that connects to peripheral devices using Bluetooth and Serial across multiple platforms is available at our [commoners-starter-kit](https://github.com/neuralinterfaces/commoners-starter-kit) repository.

Read the [documentation](https://commoners.dev) to learn more.

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

## Acknowledgments
`commoners` is maintained by Garrett Flynn, who originally developed the tool to streamline development of the [NWB GUIDE](https://github.com/neurodatawithoutborders/nwb-guide) application and support future hybrid application development for [Catalyst Neuro](https://github.com/catalystneuro).