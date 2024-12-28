import { Plugin } from "@commoners/solidarity";

function getURL(host, port) {
    return `http://${host}:${port}`
}

const sanitizeService = (
    service, 
    hostname
) => {

    // Send a localhost URL if the service is running on the same machine
    const host = hostname === service.host ? "localhost" : service.host

    return {
      name: service.name,
      host: service.host,
      metadata: service.txt,
      url: getURL(host, service.port),
    };
}

const listenForServices = async function ( type ) {

    const hostname = await import('os').then(os => os.hostname())

    const active = {};

    // Browse for all available services
    const browser = this.bonjour.find({ type }, (service) => {
        const sanitized = sanitizeService(service, hostname);
        console.log('Service Up', sanitized)
        active[sanitized.url] = sanitized;
        if (this.send) this.send("up", sanitized); // Desktop or Development
    });

     // Desktop or Development
    if (this.on && this.send) {
        this.on(`get-services`, (ev) => {
            ev.returnValue = active
            this.send(`services`, active)
        })
    }

    browser.on("down", (service) => {
      const sanitized = sanitizeService(service, hostname);
      delete active[sanitized.url];
      if (this.send) this.send("down", sanitized); // Desktop or Development
    });

    // Start the browser
    browser.start();

    return browser

}

type LocalServicePluginOptions = {
    type?: string,
    register?: true | string[]
}

function load() {
    return {
        getServices: async () => {
            return this.sendSync("get-services")
            return new Promise((resolve) => {
                const services = this.sendSync("get-services")
                this.send("get-services")
                this.on(`services`, (_, services) => {
                    console.log(services, services)
                    resolve(services)
                })
            })
        },
        onServiceUp: (callback) => this.on(`up`, (_, url) => callback(url)),
        onServiceDown: (callback) => this.on(`down`, (_, url) => callback(url)),
    }
}

export default ({
    type = 'http',
    register = []
}: LocalServicePluginOptions) => {
    return {

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
                console.log('Registering', id, !!service)
                if (!service) continue
                const { url } = service
                const port = parseInt(new URL(url).port)

                const name = `${pluginId}-${id}`
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