import { defineConfig } from "vite";

import url from "node:url";
import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";

import { type Plugin } from 'vite';
import { exec } from 'child_process';
import { nodeBuiltIns } from "./utils/config";

import { normalizePath } from "vite";
import { viteStaticCopy } from 'vite-plugin-static-copy'
import dts from 'vite-plugin-dts'

import chalk from 'chalk'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json')).toString())

const toCopy = [
  join('assets'),
]

export default defineConfig({
  plugins: [ 
    dts(),
    
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
    target: 'node16',
    lib: {
      entry: {
        index: resolve(__dirname, 'index'),
        services: resolve(__dirname, 'services/index'),
        config: resolve(__dirname, 'config')
      },
      name: 'solidarity',
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'mjs' : 'cjs'}`
    },
    rollupOptions: {
      // output: {
      //   preserveModules: true,
      // },
      external: Array.from(new Set([

        // Ensure self is handled externally
        '@commoners/solidarity',

        // User-defined external packages
        ...Object.keys(pkg.dependencies),
        ...nodeBuiltIns
      ])),
    },
  },
})