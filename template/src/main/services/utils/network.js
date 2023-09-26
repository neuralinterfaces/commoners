import net from "node:net"
import { networkInterfaces } from 'node:os'

async function createServer() {
    return new Promise(res => {
        const srv = net.createServer();
        srv.listen(0, () => res(srv));
    })
}

export async function getFreePorts(n = 1) {
    return new Promise(async res => {
        let servers = []
        for (let i = 0; i < n; i++) servers.push(await createServer())
        const ports = servers.map(srv => srv.address().port)
        servers.forEach(srv => srv.close())
        res(ports)
    })
}


export let localIP = 'localhost'

try {

    const nets = networkInterfaces();
    const results = {}

    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                if (!results[name]) {
                    results[name] = [];
                }
                results[name].push(net.address);
            }
        }
    }
    const res = (results["en0"] ?? results["Wi-Fi"])?.[0]
    if (res) localIP = res

} catch { }
