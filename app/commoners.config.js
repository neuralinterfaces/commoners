// import * as autoUpdatePlugin from '../packages/plugins/autoupdate/index.js'
import * as bluetoothPlugin from '../packages/plugins/devices/ble/index.js'
import * as serialPlugin from '../packages/plugins/devices/serial/index.js'

// import * as autoUpdatePlugin from 'commoners-autoupdate-plugin'
// import * as bluetoothPlugin from 'commoners-ble-plugin'
// import * as serialPlugin from 'commoners-serial-plugin'


export default {
    
    icon: {
        dark: 'commoners_dark.png',
        light: 'commoners_light.png'
    }, 


    plugins: [
        // autoUpdatePlugin,
        bluetoothPlugin,
        serialPlugin,

        // NOTE: These are not present on non-Electron builds because functions cannot be reliably parsed
        {
            name: 'render-only',
            renderer: () => console.log('RENDERED')
        },
        {
            name: 'preload-only',
            preload: () => console.log('PRELOADED')
        },
        {
            name: 'main-only',
            main: () => console.log('RUNNING ON MAIN')
        },
        {
            name: 'all-builds',
            electronOnly: false,
            main: () => console.log('ELECTRON BUILD (main)'),
            preload: () => console.log('ALL BUILDS (preload)'),
            renderer: () => console.log('ALL BUILDS (renderer)')

        }
    ],

    services: {
        main: {
            src: './services/backend/index.js',
            publish: {
                remote: 'http://commoners.dev/backend'
            }
        },
        python: {
            src: './services/python/main.py',
            port: 3768,
            publish: {
                build: {
                    mac: 'python -m PyInstaller --name commoners --onedir --clean ./services/python/main.py --distpath ./dist/pyinstaller',
                },
                local: {
                    src: './pyinstaller/commoners', // --onedir
                    extraResources: [ 
                        {
                            "from": "./dist/pyinstaller/commoners",
                            "to": "pyinstaller"
                        }
                    ]
                }
            }
        },
        remote: 'https://jsonplaceholder.typicode.com',
        remoteConfig: {
            url: 'http://localhost:3768', // Call the python server in development
            publish: {
                url: 'https://jsonplaceholder.typicode.com'
            }
        }
    }
}