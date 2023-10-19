import { networkInterfaces } from "node:os";

let localIP;

export const getLocalIP = (networkInterfaces) => {

    if (!localIP) {
    
        localIP = 'localhost'

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
    }

    return localIP
}



export const updateServicesWithLocalIP = (services) => {

    const host = getLocalIP(networkInterfaces) // Use public IP address for mobile development

    for (let name in services) {
        const service = services[name]
        const newHost = `//${host}:`
        service.host = host
        service.url = service.url.replace(`//localhost:`, newHost) // Transform local IP addresses
    }  

    return services
}