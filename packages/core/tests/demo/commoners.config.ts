
import * as echo from './plugins/echo'

export const name = 'Test App'

const basePort = 5555

const config = {

    name,

    electron: {
        splash: './splash.html'
    },

    plugins: { echo },

    services: {
        http: { src: './services/http/index.js' }
        // ws: { src: './services/ws/index.js' }
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

Object.values(config.services).forEach((o, i) => o.port = basePort + i)

export default config