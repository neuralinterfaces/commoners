import net from "net"

async function createServer () {
    return new Promise( res => {
        const srv = net.createServer();
        srv.listen(0, () => res(srv));
    })
}

export async function getFreePorts(n=1) {
    return new Promise( async res => {
        let servers = []
        for (let i = 0; i < n; i++) servers.push(await createServer())
        const ports = servers.map(srv => srv.address().port)
        servers.forEach(srv => srv.close())
        res(ports)
    })
}
