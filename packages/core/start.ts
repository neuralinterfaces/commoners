import { StartOptions } from "./types.js";

import { build, configureForDesktop, createServices, loadConfigFromFile, resolveConfig } from './index.js'
import { updateServicesWithLocalIP } from "./utils/ip.js";
import { buildAssets, clear } from "./common.js";
import { createServer } from "./vite/index.js";
import { ensureTargetConsistent, isDesktop, isMobile } from "./globals.js";


export default async function ( configPath: string, options: StartOptions ) {

    const { outDir, frontend, services, port } = options

    const target = ensureTargetConsistent(options.target)

    const onlyRunServices = !frontend && services

    const config = await loadConfigFromFile(configPath) // Load configuration file only once

    const resolvedConfig = await resolveConfig(config, {
        services,
        customPort: port
    });


    const isMobileTarget = isMobile(target)

    // Create URLs that will be shared with the frontend
    if (isMobileTarget) resolvedConfig.services = updateServicesWithLocalIP(resolvedConfig.services)


    const { services: resolvedServices } = resolvedConfig
    const createAllServices = () => createServices(resolvedServices) // Run services in parallel

    // Only run services
    if (onlyRunServices) await createAllServices()

    // Run services alongside the frontend
    else {

        const runFrontendWithServices = !frontend || services
        const isDesktopTarget = isDesktop(target)

        // Build for mobile before moving forward
        if (isMobileTarget) await build(configPath, options)

        // Manually clear and build the output assets
        else {

            await clear(outDir)
            await buildAssets({
                config: configPath, // NOTE: Configuration path is required for proper plugin transfer...
                outDir,
                services: isDesktopTarget
            })
        }

        // Configure the desktop instance
        if (isDesktopTarget) await configureForDesktop(outDir) // Configure the desktop instance

        // Create all services
        if (!isDesktopTarget && runFrontendWithServices) await createAllServices()

        // Serve the frontend (if not mobile)
        if (!isMobileTarget) await createServer(resolvedConfig, { 
            printUrls: !isDesktopTarget, 
            target
        })

    }
}