import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from "node:url";

// const root/ = resolve(dirname(fileURLToPath(import.meta.url)))
const root = './'

import * as checksPlugin from './src/plugins/checks'

import splashPagePlugin from '@commoners/splash-screen'
import customProtocolPlugin from '@commoners/custom-protocol'
import testingPlugin from "@commoners/testing/plugin"
import windowsPlugin from '@commoners/windows'
import * as bluetoothPlugin from '@commoners/bluetooth'
import * as serialPlugin from '@commoners/serial'

import * as services from '@commoners/solidarity/services'
import { defineConfig } from '@commoners/solidarity/config';

// WITH TREE SHAKING?
// import { defineConfig, services } from '@commoners/solidarity';

// import windowsPlugin from '../../packages/plugins/windows/index.ts'

const short_name = 'Test App'
export const name = `Commoners ${short_name}`

const httpSrc = join(root, 'src/services/http/index.ts')
const expressSrc = join(root, 'src/services/express/index.js')
const splashSrc = join(root, 'splash.html')

const remoteURL = 'https://jsonplaceholder.typicode.com/todos/1'

const TEST_OPTIONS = {
    remoteDebuggingPort: 8315,
    remoteAllowOrigins: '*' // Allow all remote origins
}

 async function manualBuildCommand (info) {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const filename = await this.package(info) 
    const outDir = path.dirname(info.out)
    fs.appendFileSync(path.join(outDir, 'test.txt'), 'Hello world!')
    return filename
}

const config = defineConfig({

    host: '0.0.0.0', // Public Vite server host (NOTE: registered as insecure)
    port: 3000, // Hardcoded Vite server port

    // // NOTE: Attempt to enable these for Commoners package testing
    // target: 'desktop' // Default target  
    // outDir: join(root, '_site'), // Custom output directory for all targets

    // build: {
    //     sign: false, // Disable code signing
    // },

    pwa: {
        manifest: { short_name }
    },

    // ------------------ Common Configuration Options ------------------
    name,

    pages: {
        services: join(root, "pages", "services", 'index.html'),
        windows: join(root, "pages", "windows", 'index.html') ,
        serial: join(root, "pages", "serial", 'index.html'),
        bluetooth: join(root, "pages", "bluetooth", 'index.html'),
    },


    plugins: {
        checks: checksPlugin,
        splash: splashPagePlugin(splashSrc),
        protocol: customProtocolPlugin('commoners', { supportFetchAPI: true }), // NOTE: Test this in detail with a build
        windows: windowsPlugin({
            popup: {
                src: join(root, "pages", "windows", 'popup.html'),
                window: {
                    height: 200,
                    width: 500
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
        express: expressSrc,

        // --------------- Manual JavaScript Compilation ---------------
        manual: {
            src: expressSrc,
            build: manualBuildCommand // Build in production directory
        },

        manualAutobuild: {
            src: expressSrc,
            publish: { build: manualBuildCommand } // Build in production directory only for build
        },

        manualCustomLocation: {
            src: expressSrc,

            build: manualBuildCommand,
            
            // Build in custom directory only for build
            publish: {
                src: 'manual',
                base: './.commoners/custom_services_dir/manual',
                build: manualBuildCommand // Resolved independently
            }
        },
        

        // Python
        ...services.python.services([
            {
                name: "basic-python",
                src:  join(root, './src/services/python/basic/main.py')
            },
            {
                name: "numpy",
                src:  join(root, './src/services/python/numpy/main.py')
            }
        ]),

        // C++
        cpp: {

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

        dynamicNode: expressSrc, // Will auto-publish on desktop builds

        devOnly: {
            src: expressSrc,
            publish: false // Explicitly block this service from publishing
        },

        // ------------------ Local + Remote ------------------

        remote: remoteURL,

        publishedToRemoteLocation: {
            src: expressSrc, // Call the Node server in development
            publish: remoteURL // Remote for all builds
        },

        // Bundled with the desktop app
        localForDesktop: {
            src: expressSrc, 
            publish: { remote: remoteURL }
        },

         // ------------------ Desktop Only ------------------
        remoteOnDesktop_removedOtherwise: {
            src: expressSrc,
            publish: { local: remoteURL },
        },

        // ------------------ Remote Only ------------------
        removedOnDesktop: {
            src: expressSrc,
            publish: { 
                url: remoteURL,
                local: false
            },
        },


    }
})

// NOTE: Remove the manual services to speed compilation
delete config.services.manual
delete config.services.manualCustomLocation

export default config