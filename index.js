#!/usr/bin/env node

import chalk from "chalk";
import minimist from 'minimist';
import path from "path";
import * as url from 'url';

const args = minimist(process.argv.slice(2))._
import { initGitRepo } from "./src/github/index.js";
import { resolveFile } from "./src/files.js";
import { spawnProcess, onExit as processOnExit } from "./src/processes.js";
import * as typescript from "./src/typescript.js";
import { __dirname } from "./globals.js";


const onExit = (...args) => {
    processOnExit(...args)
}

process.on('uncaughtException', (e) => {
    console.error(chalk.red(e))
    processOnExit()
})
process.on('beforeExit', onExit);


const option = args[1]

const globalConfig = resolveFile('commoners.config', ['.ts', '.js'], (ext) => path.join(__dirname, `src/templates/commoners.config${ext}`))
// NOTE: This still doesn't output in NodeNext format (ESM)
// const text = fs.readFileSync(globalConfig).toString()
// let result = ts.transpileModule(text, { compilerOptions: { 
//     module: ts.ModuleKind.NodeNext,
//     resolveJsonModule: true,
//     esModuleInterop: true,
// }});

const config = (await typescript.loadModule(globalConfig)).default

const command = args[0]

if (command === 'init') {
    console.log('Initializing the project')
}


if (command === 'start') spawnProcess(`tauri`, ['start'])

const devCommands = {
    frontend: () => spawnProcess(`vite`, ['dev', '--config', `${resolveFile('vite.config', ['.ts', '.js'], () => path.join(__dirname, 'src/templates/vite.config.ts'))}`]),
    backend: async () => {
        const backendFile = resolveFile(config.backend.entrypoint, ['.ts', '.js'])
        if (backendFile) {
            if (backendFile.slice(-3) === '.ts') spawnProcess('node', [await typescript.transpile(backendFile), config.backend.port])
            else spawnProcess('node', [backendFile])
        }
    },
    desktop: () => spawnProcess(`tauri`, ['dev'])
}

const buildCommands = {
    ios: () => console.log('Building for iOS'),
    android: () => console.log('Building for android'),
    desktop: () => console.log('Building for desktop'),
    pwa: () => console.log('Building for PWA'),
    backend: () => console.log('Building the backend'),
    frontend: () => spawnProcess(`vite`, ['build', '--config', `${resolveFile('vite.config', ['.ts', '.js'], () => path.join(__dirname, 'src/templates/vite.config.ts'))}`])
}

const publishCommands = {
    github: {
        repo: () => initGitRepo(...args),
        pages: () => console.log('Publishing to GitHub Pages'),
        release: () => console.log('Publishing to GitHub Releases'),
    },
    npm: () => console.log('Publishing to NPM'),    
    docker: () => console.log('Publishing to Docker'),
    backend: () => console.log('Publishing the backend somewhere')
}

const checkCommands = (baseCommand, commands, config = {}) => {
    if (baseCommand === command) {
        for (const [key, value] of Object.entries(commands)) {
            if (option === key || (!option && config[key])) {
                if (typeof value === 'function') value()
                else checkCommands(key, value, config[key])
            }
        }
    }
}

checkCommands('dev', devCommands, config.dev)
checkCommands('build', buildCommands, config.build)
checkCommands('publish', publishCommands, config.publish)