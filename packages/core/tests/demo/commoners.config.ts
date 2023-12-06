
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
        http: { 
            src: './services/http/index.js', 
            port: basePort // Hardcoded port
        },
        express: { src: './services/express/index.js' }
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