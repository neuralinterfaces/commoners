export default {
    name: "Commoners Project",
    outDir: "dist",
    
    frontend: './frontend/index',
    services: {
        first: './services/first/index',
        second: './services/second/index'
    },

    dev: {
        frontend: true,
        services: {
            first: true,
            second: true
        }
    },

    build: {
        ios: false,
        android: false,
        desktop: false,
        pwa: false,
        services: true,
        frontend: true
    },

    publish: {
        github: {
            repo: true,
            pages: false,
            releases: false
        },
        npm: false,
        docker: false,
        services: {
            first: 'https://commoners-demo-first-service.herokuapp.com' // NOTE: This is a mockup service url
        }
    },

    // Optional Configurations
    appId: "com.commoners.demo",

}