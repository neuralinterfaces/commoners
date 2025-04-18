# Commoners
[![Npm package version](https://badgen.net/npm/v/commoners)](https://npmjs.com/package/commoners)
[![Npm package monthly downloads](https://badgen.net/npm/dm/commoners)](https://npmjs.ccom/package/commoners)
![GitHub repo size](https://img.shields.io/github/repo-size/neuralinterfaces/commoners)

 The `commoners` CLI allows anyone to build their application as a Progressive Web App (PWA); Mac, Windows, and Linux desktop application; and iOS and Android mobile application—all using only HTML, CSS, and JavaScript.

Read the [documentation](https://commoners.dev) to learn more.

## Key Projects
- [Neurosys](https://github.com/neuralinterfaces/neurosys) — A desktop application for system-level neurofeedback.

## Build Solidarity
At the heart of Commoners is our belief that everyone should be able to write an application using HTML, CSS, and JavaScript for distribution on all platforms.

We use the term **build solidarity** to indicate the alignment of the world's web developers on a consistent architecture to achieve this goal.

Let's build solidarity together!

## Packages

| Package                                         | Latest Release                                                                                              |
| ----------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------- |
| [commoners](packages/cli)                           | [![commoners version](https://img.shields.io/npm/v/commoners.svg?label=View%20Changelog)](./packages/cli/CHANGELOG.md)                                    |
| [@commoners/solidarity](packages/core) | [![solidarity version](https://img.shields.io/npm/v/@commoners/solidarity.svg?label=View%20Changelog)](packages/core/CHANGELOG.md) |
| [@commoners/testing](packages/testing/CHANGELOG.md)             | [![testing utilities version](https://img.shields.io/npm/v/@commoners/testing.svg?label=View%20Changelog)](packages/testing/CHANGELOG.md)               |

### Plugins
| Package                                         | Latest Release                                                                                              |
| ----------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------- |
| [@commoners/bluetooth](packages/plugins/devices/ble)             | [![bluetooth version](https://img.shields.io/npm/v/@commoners/bluetooth.svg?label=View%20Changelog)](packages/plugins/devices/ble/CHANGELOG.md)               |
| [@commoners/serial](packages/plugins/devices/serial)             | [![serial version](https://img.shields.io/npm/v/@commoners/serial.svg?label=View%20Changelog)](packages/plugins/devices/serial/CHANGELOG.md)               |

## Contributing
You will need to have [Node.js](https://nodejs.org/en/) installed on your machine.

This repository uses PNPM for package management. Install PNPM by running the following command:
```bash
npm install -g pnpm
```

Install all packages by running the following command:
```bash
pnpm install
```

Finally, build all packages by running:
```bash
pnpm build
```

### Testing
#### Initial Setup
```bash
conda env create -f tests/demo/src/services/python/environment.yml
```

#### Running Tests
Always run tests with the `commoners-demo` environment activated.

```bash
conda activate commoners-demo
```

You must also ensure that `g++` is available to build the C++ server.

Then, simply run the following command:
```bash
pnpm test
```

##### Linux
When running tests on Linux, you'll need to install FUSE for AppImage support: 
```
sudo apt-get update && sudo apt-get install -y fuse
```


## Acknowledgements
This project is part of [Neural Interfaces](https://github.com/neuralinterfaces).