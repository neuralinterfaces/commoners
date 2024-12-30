import { Plugin } from "@commoners/solidarity";

const DEFAULT_TYPE = 'http'

const commands = {
    services: {
        get: "get-services",
        response: "services",
    },
    up: "up",
    down: "down",
}

type LocalServicePluginOptions = {
    type?: string,
    register?: true | string[]
}

function getURL(host, port) {
    return `http://${host}:${port}`
}

function sanitizeService(service) {
    return {
      name: service.name,
      host: service.host,
      metadata: service.txt,
      ip: service.referer.address,
      url: getURL(service.host, service.port)
    };
}

const listenForServices = async function ( type = DEFAULT_TYPE ) {

    const active = {};

    // Browse for all available services
    const browser = this.bonjour.find({ type }, (service) => {
        const sanitized = sanitizeService.call(this, service);
        active[sanitized.url] = sanitized;
        this.send(commands.up, sanitized); // Desktop or Development
    });

     // Desktop or Development
    this.on(commands.services.get, () => this.send(commands.services.response, active))

    browser.on(commands.down, (service) => {
      const sanitized = sanitizeService.call(this, service);
      delete active[sanitized.url];
      this.send(commands.down, sanitized); // Desktop or Development
    });

    // Start the browser
    browser.start();

    return browser

}

function load() {
    return {
        getServices: async () => {
            return new Promise((resolve) => {
                this.once(commands.services.response, (_, services) => resolve(services))
                this.send(commands.services.get)
            })
        },
        onServiceUp: (callback) => this.on(commands.up, (_, url) => callback(url)),
        onServiceDown: (callback) => this.on(commands.down, (_, url) => callback(url)),
    }
}

export default ({
    type = DEFAULT_TYPE,
    register = []
}: LocalServicePluginOptions) => {

    const registerAll = register === true

    return {

        isSupported: ({ DESKTOP, DEV }) => DESKTOP || DEV,

        load,

        start: async function ( services ) {
            const { Bonjour } = await import('bonjour-service')
            this.bonjour = new Bonjour()
            this.browser = await listenForServices.call(this, type)

            const toRegister = registerAll ? Object.keys(services) : register

            toRegister.forEach(id => {
                const service = services[id]
                if (!service) return
                service.public = true // Transform to a public service
            })
        },

        ready: async function (services, pluginId) {

            const toRegister = registerAll ? Object.keys(services) : register

            for (const id of toRegister) {
                const service = services[id]
                if (!service) continue
                const { url } = service
                const port = parseInt(new URL(url).port)

                const name = `commoners-${pluginId}-${id}`
                const published = this.bonjour.publish({ name, type, port });
                service.process.on("close", () => published.stop())
            }
        },
        quit: async function () {
            const { browser, bonjour } = this
            await new Promise(resolve => bonjour.unpublishAll(() => resolve(true)))
            if (browser) browser.stop()
            if (bonjour) bonjour.destroy() 
        }
    } as Plugin
}