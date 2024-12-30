import { networkInterfaces } from "node:os"

let LOCAL_IP; // Track local IP address to avoid repeated lookups

export const __getLocalIP = (networkInterfaces) => {

    if (!LOCAL_IP) {
    
        LOCAL_IP = 'localhost'

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
            if (res) LOCAL_IP = res
        
        } catch { }
    }

    return LOCAL_IP
}

export const getLocalIP = () => __getLocalIP(networkInterfaces)

export const updateServicesWithLocalIP = (services) => {

    const host = getLocalIP() // Use public IP address for mobile development

    for (let name in services) {
        const service = services[name]
        service.public = true
        const url = new URL(service.url)
        url.hostname = host
        service.url = url.toString() // Transform local IP addresses
    }  

    return services
}