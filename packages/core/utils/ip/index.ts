import { networkInterfaces } from "node:os"
import { getLocalIP } from "./cross-platform.js"

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