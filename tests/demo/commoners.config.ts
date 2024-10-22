import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from "node:url";

// const root/ = resolve(dirname(fileURLToPath(import.meta.url)))
const root = './'

import * as checksPlugin from './src/plugins/checks.ts'

import splashPagePlugin from '@commoners/splash-screen'
import customProtocolPlugin from '@commoners/custom-protocol'
import testingPlugin from "@commoners/testing/plugin"
import * as services from '@commoners/solidarity/services'
import windowsPlugin from '@commoners/windows'
import * as bluetoothPlugin from '@commoners/bluetooth'
import * as serialPlugin from '@commoners/serial'

// import windowsPlugin from '../../packages/plugins/windows/index.ts'

export const name = 'Test App'

const httpSrc = join(root, 'src/services/http/index.ts')
const expressSrc = join(root, 'src/services/express/index.js')
const splashSrc = join(root, 'splash.html')

const mainSrc = join(root, 'index.html')
const popupSrc = join(root, "windows", "popup", 'popup.html')

const remoteURL = 'https://jsonplaceholder.typicode.com/todos/1'

const TEST_OPTIONS = {
    remoteDebuggingPort: 8315,
    remoteAllowOrigins: '*' // Allow all remote origins
}

const config = {

    name,
    
    plugins: {
        checks: checksPlugin,
        splash: splashPagePlugin(splashSrc),
        protocol: customProtocolPlugin('app', { supportFetchAPI: true }),
        windows: windowsPlugin({
            main: mainSrc,
            popup: {
                src: popupSrc,
                window: {
                    height: 200,
                    width: 400
                },
                overrides: {
                    name: "Popup Window"
                }
            }
        }),
        bluetooth: bluetoothPlugin, 
        serial: serialPlugin,
        __testing: testingPlugin(TEST_OPTIONS)
    },

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
        ...services.python.services([
            {
                name: "flask",
                description: 'A simple Flask server',
                src:  join(root, './src/services/python/flask/main.py')
            },
            {
                name: "numpy",
                description: 'A simple Flask server with Numpy operations',
                src:  join(root, './src/services/python/numpy/main.py')
            }
        ]),

        // C++
        cpp: {
            description: 'A local C++ server',
            src:  join(root, './src/services/cpp/server.cpp'),

            // Compilation + build step
            build: async ({ src, out }) => {
                const os = await import('node:os')
                const isWindows = os.platform() === 'win32'
                const { mkdirSync } = await import('node:fs')
                const { dirname, resolve } = await import('node:path')
                mkdirSync(dirname(out), { recursive: true }) // Ensure base and asset output directory exists
                const buildCommand = `g++ ${resolve(src)} -o ${resolve(out)} -std=c++11`
                if (isWindows) return buildCommand + ` -lws2_32` // Windows requires additional linking
                return buildCommand
            },

            publish: './build/cpp/server.exe', // Specified output folder
        },

        dynamicNode: {
            description: 'A simple Node.js server',
            src: expressSrc
        },

        remote: remoteURL,

        publishedToRemoteLocation: {
            src: expressSrc, // Call the Node server in development
            url: remoteURL
        },


        // NOTE: Should be completely removed
        devOnly: {
            description: 'A local Node.js server',
            src: expressSrc,
            publish: false // Explicitly block this service from publishing
        },

        // // OLD FEATURES
        // remoteOnAllBuilds: {
        //     description: 'A simple Node.js server',
        //     src: expressSrc, // Runs on Dev Mode
        //     url: remoteURL, // Remote for all builds (web, mobile, desktop)
        // },

        // localForDesktop: {
        //     description: 'A simple Node.js server',
        //     src: expressSrc, 
        //     url: { remote: remoteURL }, // Remote for remote builds (web, mobile). Local for local builds (desktop)
        // },

        // remoteOnDesktop_removedOtherwise: {
        //     description: 'A simple Node.js server',
        //     src: expressSrc,
        //     url: { local: remoteURL }, // Remote for local builds (desktop). Removed on remote builds (web, mobile)
        // },


    }
}

export default config