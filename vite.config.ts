import { defineConfig } from "vite";
import { viteStaticCopy } from 'vite-plugin-static-copy'

import pkg from './package.json' assert {type: 'json'}

import url from "node:url";
import { join, resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));


const nodeBuiltIns = [
  "node:child_process",
  "node:fs",
  "node:url",
  "node:path",
  "node:net"
]

const outputFileName = `commoners.js`
const outputFilePath = join(__dirname, 'dist', outputFileName)

export default defineConfig({
  plugins: [
    {
      name: 'add-bin-shebang',
      closeBundle: () => writeFileSync(outputFilePath, `#!/usr/bin/env node\n${readFileSync(outputFilePath)}`)
    },

    viteStaticCopy({
      targets: [
        {
          src: resolve(__dirname, 'package.json'),
          dest: "./",
        },

        // NOTE: All of these are required for now to resolve template builds
        {
          src: resolve(__dirname, './template') + '/[!.]*',
          dest: './template',
        },
        {
          src: resolve(__dirname, './plugins') + '/[!.]*',
          dest: './plugins',
        },
        {
          src: resolve(__dirname, './src') + '/[!.]*',
          dest: './src',
        },
      ],
    })
  ],
  build: {
    emptyOutDir: false,
    target: 'node16',
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, 'index'),
      name: 'commoners',
      formats: ['es'], // 'cjs'],
      fileName: (format) => `commoners.js`
    },
    rollupOptions: {
      external: [
        ...Object.keys(pkg.dependencies),
        // ...Object.keys(pkg.devDependencies),
        ...nodeBuiltIns
      ],
    },
  },
})