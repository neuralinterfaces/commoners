import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { COMMAND, MODE, NAME, PLATFORM, RAW_NAME, TARGET, assetOutDir, configPath, outDir, rootDir, scopedOutDir, userPkg } from "./globals.js"
import { dirname, extname, join, parse, relative, sep } from "node:path"

import { isValidURL } from './utils/url.js'
import { copyAsset } from './utils/copy.js'

import * as vite from 'vite'
import * as esbuild from 'esbuild'
import { ResolvedConfig, UserService, UserConfig } from "./types.js"
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

const jsExtensions = ['.js', '.ts']

function addServiceAssets(this: AssetsCollection, config: UserService) {
    const filepath = typeof config === 'string' ? config : (config as any).src

    if (!filepath) return // Do not copy if file doesn't exist
    if (isValidURL(filepath)) return // Do not copy if file is a url

    if (jsExtensions.includes(extname(filepath))) this.bundle.push(filepath)
    else this.copy.push(filepath)
}

// Derive assets to be transferred to the COMMONERS folder
export const getAssets = async (config?: UserConfig) => {

    const resolvedConfig = await resolveConfig(config ||  await loadConfigFromFile())

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
        input: join(rootDir, 'packages', 'core', 'browser', 'script', 'onload.ts'),
        output: 'onload.mjs'
    })

    if (existsSync('.env')) assets.copy.push('.env') // Copy .env file if it exists
    
    // Copy Services Only in Development / Electron Builds
    if (COMMAND !== 'build' || TARGET === 'desktop') Object.values(resolvedConfig.services).forEach(o => addServiceAssets.call(assets, o))

    // Copy Icons
    if (resolvedConfig.icon) assets.copy.push(...(typeof resolvedConfig.icon === 'string') ? [resolvedConfig.icon] : Object.values(resolvedConfig.icon))

    // Bundle Splash Page
    if (resolvedConfig.electron.splash) assets.bundle.push(resolvedConfig.electron.splash)

    return assets
}


export const clearOutputDirectory = () => {
    if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true }) // Clear output directory (similar to Vite)
}

export const populateOutputDirectory = async ( config: ResolvedConfig ) => {
    mkdirSync(assetOutDir, { recursive: true }) // Ensure base and asset output directory exists

    writeFileSync(join(scopedOutDir, 'package.json'), JSON.stringify({ name: `commoners-${RAW_NAME}`, version: userPkg.version }, null, 2)) // Write package.json to ensure these files are treated as commonjs

    const assets = await getAssets(config)

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
    assets.copy.map(src => copyAsset(src))

    // Create yml file for dist
    writeFileSync(join(outDir, '_config.yml'), `include: ['.commoners']`)
}