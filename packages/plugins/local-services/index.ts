

function checkPort(port, host, callback) {
    const net = require('node:net');
    let socket = new net.Socket(), status: null | 'open' | 'closed' = null;
    socket.on('connect', () => { status = 'open'; socket.end(); });
    socket.setTimeout(1500);
    socket.on('timeout', () => { status = 'closed'; socket.destroy(); });
    socket.on('error', () => status = 'closed');
    socket.on('close', () => callback(null, status, host, port));

    socket.connect(port, host);
}

function getURL(host, port) {
    return `http://${host}:${port}`
}


const name = 'local-services'


const isSupported = {
    mobile: false,
    web: false
}

function main(
    _, 
    { send },
    {
        isValid: isValidService,
        port
    }: LocalServicesPluginOptions

) {

    if (!port && process.env.PORT) port = parseInt(process.env.PORT) // Fallback to the port provided by the environment
    if (!port) return console.error(`[commoners:local-services] No port provided`)

    const http = require('node:http');
    const localIP = process.env.COMMONERS_LOCAL_IP as string // Provided by COMMONERS

    const active: { [x: string]: string[] } = {}

    this.on(`${name}.get`, () => {
        Object.values(active).flat().forEach(service => send(`${name}.found`, service))
    })

    // Check for available services every 2 seconds
    setInterval(() => {

        for (var i = 1; i <= 255; i++) {
            const ip = [...localIP.split('.').slice(0, 3), i].join('.')

            checkPort(port, ip, (_, status) => {
                if (status == "open") {

                    http.get(getURL(ip, port), res => {

                        if (res.statusCode === 200) {

                            if (active[ip]) return

                            const data: string[] = [];

                            res.on('data', chunk => data.push(chunk));

                            res.on('end', () => {
                                const { commoners, services = [] } = JSON.parse(Buffer.concat(data).toString());
                                if (commoners) {
                                    if (isValidService && isValidService(ip, commoners) === false) return // Skip invalid services
                                    active[ip] = services
                                    services.forEach(port => send(`${name}.found`, (getURL(ip, port))))
                                }
                            });

                        } else res.destroy()
                    })
                } else if (active[ip]) {
                    active[ip].forEach(port => send(`${name}.closed`, getURL(ip, port)));
                    delete active[ip]
                }
            });
        }
    }, 2 * 1000)
}

export function preload() {
    return {
        get: () => this.send(`${name}.get`),
        onFound: (callback) => this.on(`${name}.found`, (_, service) => callback(service)),
        onClosed: (callback) => this.on(`${name}.closed`, (_, service) => callback(service)),
    }
}


type LocalServicesPluginOptions = {
    isValid?: (ip: string, env: any) => boolean,
    port: number
}

export default ( port: number, isValid?: (ip: string, env: any) => boolean ) => {
    return {
        name,
        isSupported,
        main: function (...args) { main.call(this, ...args, { port, isValid }) },
        preload
    }
}