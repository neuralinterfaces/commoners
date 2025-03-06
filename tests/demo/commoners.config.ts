import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from "node:url";


// const root/ = resolve(dirname(fileURLToPath(import.meta.url)))
const root = './'

import * as checksPlugin from './src/plugins/checks'

import splashPagePlugin from '@commoners/splash-screen'
import customProtocolPlugin from '@commoners/custom-protocol'
import testingPlugin from "@commoners/testing/plugin"
import windowsPlugin from '@commoners/windows'
import localServicesPlugin from "@commoners/local-services"

import * as bluetoothPlugin from '@commoners/bluetooth'
import * as serialPlugin from '@commoners/serial'

import * as services from '@commoners/solidarity/services'
import { defineConfig } from '@commoners/solidarity/config';

// NOTE: I have not been able to get tree-shaking to work and support the following import style
// import { defineConfig, services } from '@commoners/solidarity';

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

    public: true, // Public Vite server host (NOTE: registered as insecure)
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
        home: join(root, 'index.html'), // Allow navigation to the root page with commoners.PAGES.home()
        services: join(root, "pages", "services", 'index.html'),
        windows: join(root, "pages", "windows", 'index.html') ,
        serial: join(root, "pages", "serial", 'index.html'),
        bluetooth: join(root, "pages", "bluetooth", 'index.html'),
        localServices: join(root, "pages", "local-services", 'index.html'),
    },


    plugins: {
        longLoadTime: {
            load: () => new Promise(resolve => setTimeout(() => resolve(true), 2000)),
            desktop: {
                load: () => console.log('Long load time has resolved in the desktop environment')
            }
        },

        checks: checksPlugin,

        // Specify a subset of services to register as public services
        localServices: localServicesPlugin({ 
            register: [ 'http', 'numpy', 'cpp' ] 
        }),

        splash: splashPagePlugin(splashSrc, { 
            minimumDisplayTime: 1000,
            waitUntil: [ 'longLoadTime' ] 
        }), 

        protocol: customProtocolPlugin('commoners', { supportFetchAPI: true }), // NOTE: Test this in detail with a build
        windows: windowsPlugin({
            popup: {
                src: join(root, "pages", "windows", 'popup.html'),
                window: function () {

                    if (!this) return { height: 200, width: 500 } // Web environment

                    // Desktop environment
                    const displays = this.screen.getAllDisplays()
                    const externalDisplay = displays.find((display) => display.bounds.x !== 0 || display.bounds.y !== 0)

                    if (!externalDisplay) return { fullscreen: true } // Default fullscreen behavior

                    return {
                        x: externalDisplay.bounds.x,
                        y: externalDisplay.bounds.y,
                        fullscreen: true
                    }
                },
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

                // Resolve the build command to use
                const buildCommand = `g++ ${resolve(src)} -o ${resolve(out)} -std=c++11`
                return isWindows ? buildCommand + ` -lws2_32`: buildCommand // Windows requires additional linking
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
                // url: remoteURL,
                remote: remoteURL,
                local: false
            },
        },


    }
})

// NOTE: Remove the manual services to speed compilation
delete config.services.manual
delete config.services.manualCustomLocation

export default config