// import * as autoUpdatePlugin from '../packages/plugins/autoupdate/index.js'
import * as bluetoothPlugin from '../packages/plugins/devices/ble/index.js'
import * as serialPlugin from '../packages/plugins/devices/serial/index.js'

// import * as autoUpdatePlugin from 'commoners-autoupdate-plugin'
// import * as bluetoothPlugin from 'commoners-ble-plugin'
// import * as serialPlugin from 'commoners-serial-plugin'


export default {
    plugins: [
        // autoUpdatePlugin,
        bluetoothPlugin,
        serialPlugin
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