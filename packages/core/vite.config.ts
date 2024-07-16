import { defineConfig } from "vite";

import url from "node:url";
import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";

import { type Plugin } from 'vite';
import { exec } from 'child_process';
import { nodeBuiltIns } from "./utils/config";

import { normalizePath } from "vite";
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { chalk } from "./globals";

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json')).toString())

const toCopy = [
  join('templates'),
]

const dts: Plugin = {
  name: 'dts-generator',
  buildEnd: (error?: Error) => {
    if (!error) {
      return new Promise((res, rej) => {
        exec(`tsc --emitDeclarationOnly --outDir ./dist/types`,{
          cwd: __dirname
        }, async (err, stdout, stderr) => {
          console.log((await chalk).yellow(stdout))
          res()
        });
      });
    }
  },
};

export default defineConfig({
  plugins: [ 
    dts,
    
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
    emptyOutDir: false,
    target: 'node16',
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, 'index'),
      name: 'index',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format == 'es' ? 'mjs' : 'cjs'}`,
    },
    rollupOptions: {
      external: [
        'rollup', // Ensure rollup is handled externally
        ...Object.keys(pkg.dependencies),
        ...nodeBuiltIns
      ],
    },
  },
})