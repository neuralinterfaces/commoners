# Commoners
[![Npm package version](https://badgen.net/npm/v/commoners)](https://npmjs.com/package/commoners)
[![Npm package monthly downloads](https://badgen.net/npm/dm/commoners)](https://npmjs.ccom/package/commoners)
![GitHub repo size](https://img.shields.io/github/repo-size/neuralinterfaces/commoners)

**From prototype to product, for everyone.**

Commoners turns web prototypes into products, often regulated ones. It is an orchestration layer over Tauri, Electron and Capacitor. One `commoners.config.ts` builds your app for the web (PWA), desktop (Mac, Windows, Linux) and mobile (iOS, Android), and builds, bundles and supervises its services, whether they are written in Python, Rust, C++, WASM or Node.

Product-grade engineering shouldn't need a big team. Builds are secure by default, and every production build records what it contains: a [CycloneDX](https://cyclonedx.org) software bill of materials and a manifest of settings and file hashes. Commoners makes no claims for your product; it hands you the evidence.

Read the [documentation](https://commoners.dev) to learn more.

## Key Projects
- [Neurosys](https://github.com/neuralinterfaces/neurosys) — A desktop application for system-level neurofeedback.

## Build Solidarity
The name is the idea: product-grade tools held in common, so anyone can ship what used to take a large team.

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
conda env create -f examples/demo/src/services/python/environment.yml
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
```bash
sudo apt-get update && sudo apt-get install -y fuse
```


## Acknowledgements
This project is part of [Neural Interfaces](https://github.com/neuralinterfaces).