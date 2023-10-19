/// <reference types="vitest" />

import { defineConfig } from "vite";

import url from "node:url";
import { join, resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { nodeBuiltIns } from "../core/utils/config";

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const pkg = JSON.parse(readFileSync('package.json').toString())
const pkgCore = JSON.parse(readFileSync(join('..', 'core', 'package.json')).toString())

const outputFileName = `cli.js`
const outputFilePath = join(__dirname, 'dist', outputFileName)


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
  ],
  build: {
    emptyOutDir: false, // This is required so we always have permission to execute the development version that is installed in the global node_modules
    target: 'node16',
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, 'index'),
      name: 'commoners',
      formats: ['es'], // 'cjs'],
      fileName: (format) => outputFileName
    },
    rollupOptions: {
      external: [
        ...Object.keys(pkg.dependencies),
        ...Object.keys(pkgCore.dependencies),
        ...nodeBuiltIns
      ],
    },
  },
})