import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { RAW_NAME, rootDir, userPkg, getAssetOutDir, getScopedOutDir, defaultOutDir, templateDir } from "./globals.js"
import { dirname, extname, join, parse, relative, sep } from "node:path"

import { isValidURL } from './utils/url.js'
import { copyAsset } from './utils/copy.js'

import * as vite from 'vite'
import * as esbuild from 'esbuild'
import { UserService, UserConfig, ResolvedConfig } from "./types.js"
import { loadConfigFromFile, resolveConfig } from "./index.js"

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

const jsExtensions = ['.js', '.ts']

function addServiceAssets(this: AssetsCollection, config: UserService) {
    const filepath = typeof config === 'string' ? config : (config as any).src

    if (!filepath) return // Do not copy if file doesn't exist
    if (isValidURL(filepath)) return // Do not copy if file is a url

    if (jsExtensions.includes(extname(filepath))) this.bundle.push(filepath)
    else this.copy.push(filepath)
}

// Derive assets to be transferred to the COMMONERS folder

// NOTE: A configuration file is required because we can't transfer plugins between browser and node without it...

export const getAssets = async (config: UserConfig | string, services: AssetServicesArgument = false) => {
    
    let configPath

    if (typeof config === 'string') {
        configPath = config
        config = await loadConfigFromFile(config)
    }
    const resolvedConfig = await resolveConfig(config)

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
        Object.values(services).forEach(o => addServiceAssets.call(assets, o))
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


export const clear = (outDir: string = defaultOutDir) => {
    if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true }) // Clear output directory (similar to Vite)
}

export const buildAssets = async ({
    config, 
    outDir = defaultOutDir,
    services = {}
}: {
    config: ResolvedConfig | string,
    outDir?: string,
    services?: AssetServicesArgument
}) => {

    const assetOutDir = getAssetOutDir(outDir)
    const scopedOutDir = getScopedOutDir(outDir)

    mkdirSync(assetOutDir, { recursive: true }) // Ensure base and asset output directory exists

    writeFileSync(join(scopedOutDir, 'package.json'), JSON.stringify({ name: `commoners-${RAW_NAME}`, version: userPkg.version }, null, 2)) // Write package.json to ensure these files are treated as commonjs

    const assets = await getAssets(config, services)

    // Create an assets folder with copied assets (ESM)
    await Promise.all(assets.bundle.map(async info => {

        const hasMetadata = typeof info !== 'string'
        const input = hasMetadata ? info.input : info
        const output = hasMetadata ? info.output : null
        const explicitOutput = typeof output === 'string' ? output : null
        const hasExplicitInput = typeof input === 'string'

        if (hasMetadata && 'text' in info && hasMetadata && explicitOutput) writeFileSync(join(assetOutDir, explicitOutput), info.text)
        else if (hasExplicitInput) {
            const ext = extname(input)
            const outPath = explicitOutput ? join(assetOutDir, explicitOutput) : join(assetOutDir, input)
            const outDir = dirname(outPath)
            const root = dirname(input)


            // Bundle HTML Files using Vite
            if (ext === '.html') await vite.build({
                logLevel: 'silent',
                base: "./",
                root,
                build: {
                    outDir: relative(root, outDir),
                    rollupOptions: { input: input }
                },
            })

            // Build JavaScript Files using ESBuild
            else {

                const resolvedExtension = explicitOutput ? extname(explicitOutput).slice(1) : (hasMetadata ? output?.extension : '') || 'js'
                const outfile = explicitOutput ? outPath : join(outDir, `${parse(input).name}.${resolvedExtension}`)

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

    // Create yml file for dist
    writeFileSync(join(outDir, '_config.yml'), `include: ['.commoners']`)
}