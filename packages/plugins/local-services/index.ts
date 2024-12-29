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

const sanitizeService = (
    service
) => {

    // Send a localhost URL if the service is running on the same machine
    const host = service.host ? "localhost" : service.host

    return {
      name: service.name,
      host: service.host,
      metadata: service.txt,
      url: `http://${service.referer.address}:${service.port}`,
    };
}

const listenForServices = async function ( type = DEFAULT_TYPE ) {

    const active = {};

    // Browse for all available services
    const browser = this.bonjour.find({ type }, (service) => {
        const sanitized = sanitizeService(service);
        active[sanitized.url] = sanitized;
        if (this.send) this.send(commands.up, sanitized); // Desktop or Development
    });

     // Desktop or Development
    if (this.on && this.send) this.on(commands.services.get, () => this.send(commands.services.response, active))

    browser.on(commands.down, (service) => {
      const sanitized = sanitizeService(service);
      delete active[sanitized.url];
      if (this.send) this.send(commands.down, sanitized); // Desktop or Development
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
        onServiceUp: (callback) => this.on(commands.up, (evt, url) => {
            console.log('Service up', evt, url)
            callback(url)
        }),
        onServiceDown: (callback) => this.on(commands.down, (_, url) => callback(url)),
    }
}

export default ({
    type = DEFAULT_TYPE,
    register = []
}: LocalServicePluginOptions) => {
    return {

        isSupported: ({ DESKTOP, DEV }) => DESKTOP || DEV,

        load,

        start: async function () {
            const { Bonjour } = await import('bonjour-service')
            this.bonjour = new Bonjour()
            this.browser = await listenForServices.call(this, type)
        },

        ready: async function (services, pluginId) {

            if (register === true) register = Object.keys(services)
            
            for (const id of register) {
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