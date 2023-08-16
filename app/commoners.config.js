export default {
    plugins: {
        autoupdate: true,
        bluetooth: true,
        serial: true
    },

    services: {
        main: {
            src: './services/backend/index.js',
            production: {
                url: 'http://commoners.dev/backend' // TODO: Support this structure
            }
        },
        python: {
            src: './services/python/main.py',
            buildCommand: {
                mac: 'python -m PyInstaller --name commoners --onedir --clean ./services/python/main.py --distpath ./dist/pyinstaller',
            },
            production: {
                src: './pyinstaller/commoners', // --onedir
                extraResources: [ 
                     {
                        "from": "./dist/pyinstaller/commoners",
                        "to": "pyinstaller"
                    }
                ]
            }
        },
        remote: 'https://example.com',
        remoteConfig: {
            url: 'https://example.com'
        }
    }
}