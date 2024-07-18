import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)))

import * as echo from './src/plugins/echo'

export const name = 'Test App'

const basePort = 2345

const httpSrc = join(root, 'src/services/http/index.ts')
const expressSrc = join(root, 'src/services/express/index.js')

const config = {

    name,

    electron: {
        splash: join(root, 'splash.html'),
    },

    plugins: { echo },

    services: {
        http: { 
            src: httpSrc, 
            port: basePort // Hardcoded port
        },
        express: { src: expressSrc },
        manual: {
            src: expressSrc,
            
            build: async function (info) { 

                const fs = await import('node:fs')
                const path = await import('node:path')
                const filename = await this.package(info) 
                fs.appendFileSync(path.join(info.build.outDir, 'test.txt'), 'Hello world!')
                return filename
            },

            publish: {
                src: 'manual',
                base: './build/manual'
            }
        }
        // python: {
        //     description: 'A simple Python server',
        //     src: './src/services/python/main.py',
        //     build: 'python -m PyInstaller --name flask --onedir --clean ./src/services/python/main.py --distpath ./build/python',
        //     publish: {
        //         src: 'flask',
        //         base: './build/python/flask', // Will be copied
        //     }
        // },
    }
}

export default config