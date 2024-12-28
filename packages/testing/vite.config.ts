import { defineConfig } from 'vite'

import url from "node:url";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

import { nodeBuiltIns } from '../core/utils/config'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json')).toString())

export default defineConfig({
  build: {
    target: 'node16',
    lib: {
      entry: {
        main: "src/index",
        plugin: "src/plugin"
      },
      name: 'testing',
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => {
        return `${entryName}.${format === 'es' ? 'mjs' : 'cjs'}`
      }
    },
    rollupOptions: {
      external: Array.from(new Set([
        "electron-builder",
        ...Object.keys(pkg.dependencies),
        ...nodeBuiltIns,
      ])),
    },
  }
})
