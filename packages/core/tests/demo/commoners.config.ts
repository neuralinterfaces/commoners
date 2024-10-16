import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from "node:url";

// const root/ = resolve(dirname(fileURLToPath(import.meta.url)))
const root = './'

import * as echo from './src/plugins/echo'

export const name = 'Test App'

const httpSrc = join(root, 'src/services/http/index.ts')
const expressSrc = join(root, 'src/services/express/index.js')

const config = {

    name,

    electron: {
        splash: join(root, 'splash.html'),
    },

    plugins: { echo },

    services: {

        // TypeScript
        http: { 
            src: httpSrc, 
            port: 2345 // Hardcoded port
        },

        // JavaScript
        express: { src: expressSrc },

        // Manual JavaScript Compilation
        manual: {
            src: expressSrc,
            
            build: async function (info) { 
                const fs = await import('node:fs')
                const path = await import('node:path')
                const filename = await this.package(info) 
                const outDir = path.dirname(info.out)
                fs.appendFileSync(path.join(outDir, 'test.txt'), 'Hello world!')
                return filename
            },

            publish: {
                src: 'manual',
                base: './.commoners/custom_services_dir/manual'
            }
        },


        // Python
        python: {
            description: 'A simple Python server',
            src: './src/services/python/main.py',
            build: 'python -m PyInstaller --name flask --onedir --clean ./src/services/python/main.py --distpath ./build/python',
            publish: {
                src: 'flask',
                base: './build/python/flask', // Will be copied
            }
        },

        // C++
        cpp: {
            description: 'A local C++ server',
            src: './src/services/cpp/server.cpp',

            // Compilation + build step
            build: async ({ src, out }) => {
                const { mkdirSync, existsSync } = await import('node:fs')
                const { dirname, resolve } = await import('node:path')
                mkdirSync(dirname(out), { recursive: true }) // Ensure base and asset output directory exists
                return `g++ ${resolve(src)} -o ${resolve(out)} -std=c++11`
            },

            publish: './build/cpp/server.exe', // Specified output folder
        },

        // // NOTE: Must adjust testing code to ignore services when not present
        // dynamicNode: {
        //     description: 'A simple Node.js server',
        //     src: './src/services/node/index.js',
        //     // url: 'https://node.example.com', // Remote for all builds (web, mobile, desktop)
        //     // url: { remote: 'https://node.example.com' }, // Remote for remote builds (web, mobile). Local for local builds (desktop)
        //     // url: { local: 'https://node.example.com' }, // Remote for local builds (desktop). Removed on remote builds (web, mobile)
        // },

        // devNode: {
        //     description: 'A local Node.js server',
        //     src: './src/services/node/index.js',
        //     publish: false // Do not publish this service
        // },

        // remote: 'https://jsonplaceholder.typicode.com',

        // dynamic: {
        //     src: 'http://localhost:1111', // Call the python server in development
        //     url: 'https://jsonplaceholder.typicode.com'
        // }

    }
}

export default config