
import * as echo from './demo/plugins/echo'

export const name = 'Test App'

const basePort = 5555

const expressSource = './demo/services/express/index.js'

const config = {

    name,

    electron: {
        splash: './demo/splash.html'
    },

    plugins: { echo },

    services: {
        http: { 
            src: './demo/services/http/index.ts', 
            port: basePort // Hardcoded port
        },
        express: { src: expressSource },
        manual: {
            src: expressSource,
            
            build: async function (info) { 

                const fs = await import('node:fs')
                const path = await import('node:path')

                const filename = await this.package(info) 

                // Write a file to the build directory
                fs.appendFileSync(path.join(info.base, 'test.txt'), 'Hello world!')

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