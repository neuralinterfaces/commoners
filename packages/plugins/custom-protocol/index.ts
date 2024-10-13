// Custom Protocol Support (https://www.electronjs.org/docs/latest/api/protocol#protocolregisterschemesasprivilegedcustomschemes)
export default (scheme: string, privileges: Electron.CustomScheme["privileges"] = {}) => {
    return {
        isSupported: {
            web: false,
            mobile: false
        },
        load: () => scheme,
        desktop: {
            start: async function () {
                const { protocol } = this.electron
                protocol.registerSchemesAsPrivileged([{ scheme, privileges }])
            },
            ready: async function (services = {}) {

                const { protocol, net } = this.electron
                const { electronApp } = this.utils

                // Set app user model id for windows
                electronApp.setAppUserModelId(`com.${scheme}`)

                protocol.handle(scheme, (req) => {

                    const { host, pathname } = new URL(req.url)

                    // Proxy the services through the custom protocol
                    if (services[host]) return net.fetch((new URL(pathname, services[host].url)).href)

                    return new Response(`${pathname} is not a valid request`, {
                        status: 404
                    })
                })
            },
        },
    };
};
