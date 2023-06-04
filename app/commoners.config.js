export default {
    services: {
        main: {
            file: './services/backend/index.js',
            production: {
                url: 'http://commoners.dev/backend' // TODO: Support this structure
            }
        },
        remote: 'https://example.com',
        remoteConfig: {
            url: 'https://example.com'
        }
    }
}