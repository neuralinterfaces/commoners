import { UserConfig } from "./types.js";

import { build, configureForDesktop, createServices, resolveConfig } from './index.js'
import { updateServicesWithLocalIP } from "./utils/ip/index.js";
import { buildAssets } from "./utils/assets.js";
import { createServer } from "./vite/index.js";
import { chalk, cleanup, globalTempDir, initialize, isDesktop, isMobile, onExit } from "./globals.js";

import { join } from "node:path";

import { printHeader, printTarget } from "./utils/formatting.js"

export default async function ( opts: UserConfig = {} ) {

        const { port } = opts
    
        const resolvedConfig = await resolveConfig(opts, { customPort: port });
        
        const { target, name, root } = resolvedConfig

        const isDesktopTarget = isDesktop(target)
        const isMobileTarget = isMobile(target)

        await printHeader(`${name} — ${printTarget(target)} Development`)

        // Create URLs that will be shared with the frontend
        if (isMobileTarget) resolvedConfig.services = updateServicesWithLocalIP(resolvedConfig.services)

        const { services: resolvedServices } = resolvedConfig
        
        const createAllServices = () => createServices(resolvedServices, { root }) // Run services in parallel

        const outDir = join(root, globalTempDir)

        await initialize(outDir)

        // Build for mobile before moving forward
        if (isMobileTarget) await build(resolvedConfig, { services: resolvedServices, dev: true })

        // Manually clear and build the output assets
        else {
            const copy = { ...resolvedConfig }
            copy.build = { ...copy.build, outDir }
            await buildAssets(copy)
        }


        const activeInstances: {
            frontend?: Awaited<ReturnType<typeof createServer>>,
            services?: Awaited<ReturnType<typeof createAllServices>>
        } = {}

        const closeFunction = (o) => {
            cleanup(outDir) // Ensure the temporary directory is cleared
            if (o.frontend) activeInstances.frontend?.close()
            if (o.services) activeInstances.services?.close()
        }

        const manager: {
            url?: string,
            close: typeof closeFunction
        } = {
            close: closeFunction
        }

        // Configure the desktop instance
        if (isDesktopTarget) await configureForDesktop(outDir, root)

        // Create all services
        else activeInstances.services = await createAllServices()

        // Serve the frontend (if not mobile)
        if (!isMobileTarget) {
            
            const frontend = activeInstances.frontend = await createServer(resolvedConfig, { 
                printUrls: !isDesktopTarget, 
                outDir,
                target
            })

            manager.url = frontend.resolvedUrls.local[0] // Add URL to locate the server
        
        }


        onExit(() => manager.close({ services: true, frontend: true })) // Close all services and frontend on exit

        return manager
}