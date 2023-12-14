import { Plugin } from "@commoners/solidarity";
import { getLocalIP } from "../../core/utils/ip/cross-platform";

import pkg from './package.json'

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

const isSupported = {
    mobile: false,
    web: false
}

function loadDesktop(
    {
        isValid: isValidService,
        port
    }: LocalServicesPluginOptions
) {

    if (!port && process.env.COMMONERS_SHARE_PORT) port = parseInt(process.env.COMMONERS_SHARE_PORT) // Fallback to the port provided by the environment
    if (!port) return console.error(`[commoners:local-services] No port provided`)

    console.log(`[${pkg.name}]: Searching for local services on port ${port}\n`)

    const http = require('node:http');

    const localIP = getLocalIP(require('node:os').networkInterfaces)

    const active: { [x: string]: string[] | null } = {}

    this.on(`get`, () => {
        Object.entries(active).filter(arr => !!arr[1]).map(([ip, ports]) => ports.map(port => getURL(ip, port))).flat().forEach(service => this.send(`found`, service))
    })

    // Check for available services every 2 seconds
    setInterval(() => {

        for (var i = 1; i <= 255; i++) {
            const ip = [...localIP.split('.').slice(0, 3), i].join('.')

            checkPort(port, ip, (_, status) => {

                if (status == "open") {

                    const url = getURL(ip, port)

                    http.get(url, res => {

                        if (res.statusCode === 200) {

                            if (ip in active) return

                            const data: string[] = [];

                            res.on('data', chunk => data.push(chunk));

                            res.on('end', () => {
                                try {
                                    const { commoners, services = {} } = JSON.parse(Buffer.concat(data).toString());
                                    if (commoners) {
                                        if (isValidService && isValidService(ip === localIP ? 'localhost' : ip, commoners) === false) return // Skip invalid services
                                        active[ip] = services
                                        Object.values(services).forEach(port => this.send(`found`, getURL(ip, port)))
                                    }
                                } catch {
                                    active[ip] = null
                                }
                            });

                        } else res.destroy()
                    })
                } else if (ip in active) {
                    const info = active[ip]
                    if (info) Object.values(info).forEach(port => this.send(`closed`, getURL(ip, port)));
                    delete active[ip]
                }
            });
        }
    }, 2 * 1000)
}

export function load() {
    return {
        get: () => this.send(`get`),
        onFound: (callback) => this.on(`found`, (_, url) => callback(url)),
        onClosed: (callback) => this.on(`closed`, (_, url) => callback(url)),
    }
}


type LocalServicesPluginOptions = {
    isValid?: (ip: string, env: any) => boolean,
    port: number
}

export default ( isValid?: (ip: string, env: any) => boolean, port?: number ) => {
    return {
        isSupported,
        desktop: {
            load: function (win) { loadDesktop.call(this, { port, isValid }) },
        },
        load
    } as Plugin
}