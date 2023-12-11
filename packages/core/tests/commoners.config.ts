
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
            src: './demo/services/http/index.js', 
            port: basePort // Hardcoded port
        },
        express: { src: expressSource },
        manual: {
            src: expressSource,
            publish: {
                build: async function (info) {  return this.package(info) },
                local: {
                    src: 'manual',
                    base: './build/manual'
                }
            }
        }
        // python: {
        //     description: 'A simple Python server',
        //     src: './src/services/python/main.py',
        //     publish: {
        //         build: 'python -m PyInstaller --name flask --onedir --clean ./src/services/python/main.py --distpath ./build/python',
        //         local: {
        //             src: 'flask',
        //             base: './build/python/flask', // Will be copied
        //         }
        //     }
        // },
    }
}

export default config