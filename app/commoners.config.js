export default {
    services: {
        main: {
            src: './services/backend/index.js',
            production: {
                url: 'http://commoners.dev/backend' // TODO: Support this structure
            }
        },
        python: {
            src: './services/python/main.py',
            port: 4242,
            production: {
                src: './dist/commoners/commoners' // TODO: Support this structure
            }
        },
        remote: 'https://example.com',
        remoteConfig: {
            url: 'https://example.com'
        }
    }
}