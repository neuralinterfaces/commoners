import { defineConfig } from "vite";

import url from "node:url";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'package.json')).toString())

const nodeBuiltIns = [
  "node:child_process",
  "node:fs",
  "node:url",
  "node:path",
  "node:net",
  "node:util",
  "node:os"
]

import { type Plugin } from 'vite';
import { exec } from 'child_process';
import chalk from "chalk";

const dts: Plugin = {
  name: 'dts-generator',
  buildEnd: (error?: Error) => {
    if (!error) {
      return new Promise((res, rej) => {
        exec(`tsc --emitDeclarationOnly --outDir ../../dist/types`,{
          cwd: __dirname
        }, (err, stdout, stderr) => {
          console.log(chalk.yellow(stdout))
          res()
        });
      });
    }
  },
};

export default defineConfig({
  plugins: [ dts ],
  build: {
    emptyOutDir: false,
    target: 'node16',
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, 'index'),
      name: 'index',
      formats: ['es'], // 'cjs'],
      fileName: (format) => `index.js`
    },
    rollupOptions: {
      external: [
        ...Object.keys(pkg.dependencies),
        ...nodeBuiltIns
      ],
    },
  },
})