/// <reference types="vitest" />

import { defineConfig, normalizePath } from "vite";
import { viteStaticCopy } from 'vite-plugin-static-copy'

import url from "node:url";
import { join, resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const pkg = JSON.parse(readFileSync('./package.json').toString())

const nodeBuiltIns = [
  "node:child_process",
  "node:fs",
  "node:url",
  "node:path",
  "node:net",
  "node:util",
  "node:os"
]

const outputFileName = `cli.js`
const outputFilePath = join(__dirname, 'dist', outputFileName)

const toCopy = [
  'template',
  'packages/core/browser/script',
]

export default defineConfig({
  test: {

  },
  plugins: [
    {
      name: 'add-bin-shebang',
      closeBundle: () => {
        const src = readFileSync(outputFilePath)
        const shebang = '#!/usr/bin/env node'
        if (!src.includes(shebang)) {
          writeFileSync(outputFilePath, `${shebang}\n${readFileSync(outputFilePath)}`)
        }
      }
    },

    viteStaticCopy({
      targets: [
        {
          src: normalizePath(resolve(__dirname, 'package.json')),
          dest: "./",
        },
      
        // NOTE: All of these are required for now to resolve template builds
        ...toCopy.map(path => {
          return {
            src: normalizePath(resolve(__dirname, path)) + '/[!.]*',
            dest: join(path),
          }
        })
      ],
    })
  ],
  build: {
    emptyOutDir: false, // This is required so we always have permission to execute the development version that is installed in the global node_modules
    target: 'node16',
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, 'packages', 'cli', 'index'),
      name: 'commoners',
      formats: ['es'], // 'cjs'],
      fileName: (format) => outputFileName
    },
    rollupOptions: {
      external: [
        ...Object.keys(pkg.dependencies),
        ...nodeBuiltIns
      ],
    },
  },
})