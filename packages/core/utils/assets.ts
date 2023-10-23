import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { RAW_NAME, rootDir, userPkg } from "../globals.js"
import { dirname, extname, join, parse, relative, sep } from "node:path"

import { isValidURL } from './url.js'
import { copyAsset } from './copy.js'

import * as vite from 'vite'
import * as esbuild from 'esbuild'
import { ResolvedService, ResolvedConfig } from "../types.js"
import { loadConfigFromFile, resolveConfig } from "../index.js"

import { spawnProcess } from './processes.js'
import chalk from "chalk"

type AssetInfo = string | {
    input: string,
    output?: string | {
        extension?: 'mjs' | 'cjs'
    }
}  | { text?: string, output: string }

type AssetsCollection = {
    copy: AssetInfo[],
    bundle: AssetInfo[]
}

type AssetServicesArgument = boolean | ResolvedConfig['services']

const jsExtensions = ['.js', '.mjs', '.cjs', '.ts']

function addServiceAssets(this: AssetsCollection, config: ResolvedService) {
    const filepath = config.src

    if (!filepath) return // Do not copy if file doesn't exist
    if (isValidURL(filepath)) return // Do not copy if file is a url

    if (jsExtensions.includes(extname(filepath))) this.bundle.push(filepath)
    else this.copy.push(filepath)
}


async function buildService(service, name, force = false){

        let build = (service && typeof service === 'object') ? service.build : null

        if (!build) return

        const hasBeenBuilt = existsSync(service.src)
        if (hasBeenBuilt && !force) return

        if (typeof build === 'function') build = build() // Run based on the platform if an object

        if (build) {
            console.log(`\nRunning build command for the ${chalk.bold(name)} service\n`)
            await spawnProcess(build)
        }
}

// Derive assets to be transferred to the COMMONERS folder

// NOTE: A configuration file is required because we can't transfer plugins between browser and node without it...

export const getAssets = async (config: AssetConfig, services: AssetServicesArgument = false, buildServices = false) => {
    
    let configPath, resolvedConfig

    if (typeof config === 'string') {
        configPath = config
        config = await loadConfigFromFile(config)
    } 
    
    if (config && typeof config === 'object' && 'path' in config) {
        configPath = config.path
        resolvedConfig = config.resolved
    } 
    
    else resolvedConfig = await resolveConfig(config)



    const configExtensionTargets = ['cjs', 'mjs']

    // Transfer configuration file and related services
    const assets: AssetsCollection = {
        copy: [],
        bundle: configExtensionTargets.map(ext => { return configPath ? {
            input: configPath.split(sep).slice(-1)[0],
            output: { extension: ext }
        } : { text: 'export default {}', output: `commoners.config.${ext}` } })
    }

    // Bundle onload script for the browser
    assets.bundle.push({
        input: join(rootDir, 'templates', 'onload.ts'),
        output: 'onload.mjs'
    })

    if (existsSync('.env')) assets.copy.push('.env') // Copy .env file if it exists
    
    // Copy Provided Services
    if (services) {
        if (typeof services === 'boolean') services = resolvedConfig.services

        await Promise.all(Object.entries(services).map(async ([name, o]) => {
            addServiceAssets.call(assets, o)
            await buildService(o, name)
        }))
    }

    // Copy Icons
    if (resolvedConfig.icon) {

        const icons = (typeof resolvedConfig.icon === 'string') ? [resolvedConfig.icon] : Object.values(resolvedConfig.icon)

        assets.copy.push(...icons)
    }

    // Bundle Splash Page
    if (resolvedConfig.electron.splash) assets.bundle.push(resolvedConfig.electron.splash)

    return assets
}


export const clear = (outDir: string) => {
    if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true }) // Clear output directory (similar to Vite)
}


type AssetConfig = { path: string, resolved: ResolvedConfig } | ResolvedConfig | string
export const buildAssets = async ({
    config, 
    outDir,
    services = {},
    buildServices = false
}: {
    config: AssetConfig,
    outDir: string,
    services?: AssetServicesArgument
}) => {

    mkdirSync(outDir, { recursive: true }) // Ensure base and asset output directory exists

    writeFileSync(join(outDir, 'package.json'), JSON.stringify({ name: `commoners-${RAW_NAME}`, version: userPkg.version }, null, 2)) // Write package.json to ensure these files are treated as commonjs

    const assets = await getAssets(config, services)

    // Create an assets folder with copied assets (ESM)
    await Promise.all(assets.bundle.map(async info => {

        const hasMetadata = typeof info !== 'string'
        const input = hasMetadata ? info.input : info
        const output = hasMetadata ? info.output : null
        const explicitOutput = typeof output === 'string' ? output : null
        const hasExplicitInput = typeof input === 'string'

        if (hasMetadata && 'text' in info && hasMetadata && explicitOutput) writeFileSync(join(outDir, explicitOutput), info.text)
        else if (hasExplicitInput) {
            const ext = extname(input)
            const outPath = explicitOutput ? join(outDir, explicitOutput) : join(outDir, input)

            const root = dirname(input)


            // Bundle HTML Files using Vite
            if (ext === '.html') await vite.build({
                logLevel: 'silent',
                base: "./",
                root,
                build: {
                    outDir: relative(root, dirname(outPath)),
                    rollupOptions: { input: input }
                },
            })

            // Build JavaScript Files using ESBuild
            else {
                
                const resolvedExtension = explicitOutput ? extname(explicitOutput).slice(1) : (hasMetadata ? output?.extension : '') || 'js'
                const outfile = join(dirname(outPath), `${parse(input).name}.${resolvedExtension}`)

                const baseConfig: esbuild.BuildOptions = {
                    entryPoints: [input],
                    bundle: true,
                    logLevel: 'silent',
                    outfile,
                }

                // Force a build format if the proper extension is specified
                const format = resolvedExtension === 'mjs' ? 'esm' : resolvedExtension === 'cjs' ? 'cjs' : undefined


                const buildForNode = () => buildForBrowser({ platform: 'node', external: [ "*.node" ] })
                
                const buildForBrowser = (opts = {}) => esbuild.build({ ...baseConfig, format, ...opts})
                
                if (resolvedExtension === 'cjs') buildForNode()
                else buildForBrowser().catch(buildForNode) // Externalize all node dependencies
            }
        } 
        
        else console.warn('Asset not transferred to the build:', input)
    }))

    // Copy static assets
    assets.copy.map(info => copyAsset(info, { outDir }))
}