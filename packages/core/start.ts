// Built-In Modules
import { join } from "node:path";

// Internal Imports
import { build, configureForDesktop, createServices, resolveConfig } from './index.js'
import { globalTempDir, handleTemporaryDirectories, isDesktop, isMobile, onCleanup } from "./globals.js";
import { UserConfig } from "./types.js";
import { createServer } from "./vite/index.js";

// Internal Utilities
import { buildAssets } from "./utils/assets.js";
import { removeDirectory } from './utils/files.js'
import { printHeader, printTarget } from "./utils/formatting.js"
import { updateServicesWithLocalIP } from "./utils/ip/index.js";

export default async function ( 
    opts: UserConfig = {} 
) {
        
        const resolvedConfig = await resolveConfig(opts);
        
        const { target, name, root } = resolvedConfig

        const isDesktopTarget = isDesktop(target)
        const isMobileTarget = isMobile(target)

        await printHeader(`${name} — ${printTarget(target)} Development`)

        // Create URLs that will be shared with the frontend
        if (isMobileTarget) resolvedConfig.services = updateServicesWithLocalIP(resolvedConfig.services)

        const { services: resolvedServices } = resolvedConfig
        
        const createAllServices = () => createServices(resolvedServices, { root, target, services: true, build: false }) // Run services in parallel

        const outDir = join(root, globalTempDir)

       const tempDirManager = await handleTemporaryDirectories(outDir)

        // Build for mobile before moving forward
        if (isMobileTarget) await build(resolvedConfig, { services: resolvedServices, dev: true })

        // Manually clear and build the output assets
        else {
            const copy = { ...resolvedConfig }
            copy.build = { ...copy.build, outDir }
            await buildAssets(copy, undefined, true)
        }

        const activeInstances: {
            frontend?: Awaited<ReturnType<typeof createServer>>,
            services?: Awaited<ReturnType<typeof createAllServices>>
        } = {}

        const closeFunction = (o) => {
            if (o.frontend) activeInstances.frontend?.close() // Close server first
            if (o.services) activeInstances.services?.close() // Close custom services next
            removeDirectory(outDir) // Then clear the temporary directory
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

        const closeAll = (o) => {
            tempDirManager.close()
            manager.close(o)
        }

        onCleanup(() => {
            closeAll({ services: true, frontend: true }) // Close all services and frontend on exit
        })

        return {
            url: manager.url,
            close: closeAll
        }
}