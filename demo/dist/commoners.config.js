export default {
    name: "Commoners Demo App",
    ourDir: "dist",
    frontend: {
        port: 3760,
    },
    // Backend Configuration
    backend: {
        port: 3768,
        entrypoint: './backend/index'
    },
    dev: {
        frontend: true,
        backend: true
    },
    build: {
        ios: false,
        android: false,
        desktop: false,
        pwa: false,
        backend: false,
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
        backend: false
    },
    // Optional Configurations
    appId: "com.commoners.demo",
};
