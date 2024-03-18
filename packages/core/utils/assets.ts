import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { onExit, rootDir } from "../globals.js"
import { dirname, extname, join, parse, relative, isAbsolute, basename } from "node:path"

import { isValidURL } from './url.js'
import { copyAsset } from './copy.js'

import * as vite from 'vite'
import * as esbuild from 'esbuild'
import { ResolvedConfig, ResolvedService, UserConfig } from "../types.js"
import { resolveConfig, resolveConfigPath } from "../index.js"

import pkg from 'pkg'

import { spawnProcess } from './processes.js'
import chalk from "chalk"

type AssetMetadata = {
    extraResource?: boolean,
    sign?: boolean
}

type CoreAssetInfo = string | {
    input: string,
    output?: string | {
        extension: 'mjs' | 'cjs', // JavaScript
    },
    force?: boolean
} & AssetMetadata

type AssetInfo = CoreAssetInfo | { text: string, output: string }

type AssetOutput = { file: string } & AssetMetadata

type AssetsCollection = {
    copy: CoreAssetInfo[],
    bundle: AssetInfo[]
}

const bundleExtensions = [ '.ts' ]
const jsExtensions = ['.js', '.mjs', '.cjs', ...bundleExtensions]
 
// Intelligently build service only if it hasn't been built yet (unless forced)
const mustBuild = ({ name, out, force }, log = false) => {
    const hasBeenBuilt = existsSync(out)
    if (hasBeenBuilt && !force) return false
    if (log) console.log(`\n👊 ${hasBeenBuilt ? 'Updating' : 'Creating'} the ${chalk.bold(chalk.greenBright(name))} service\n`)
    return true
}


type PackageInfo = {
    name: string,
    force?: boolean,
    src: string,
    out: string
}

export const packageFile = async (info: PackageInfo, log = true) => {

    const { 
        name, 
        src, 
        out, 
        force 
    } = info

    const tempOut = join(out, `${name}.js`)

    const shouldBuild = mustBuild({
        out,
        force,
        name
    }, log)

    if (!shouldBuild) return out

    await esbuild.build({ 
        entryPoints: [ src ],
        bundle: true,
        logLevel: 'silent',
        outfile: tempOut,
        format: 'cjs', 
        platform: 'node', 
        external: [ "*.node" ]
    })

    await pkg.exec([tempOut, '--target', 'node16', '--out-path', out]);

    rmSync(tempOut, { force: true })

    return out
}


async function buildService(
    { 
        build,
        out,
        src,
    }: { 
        src: string,
        out: string,
        build: ResolvedService['build'] 
    }, 
    name, 
    force = false
){

        if (!build) return null
        
        // Check Auto Builds
        if (build && typeof build === 'object') {
            return packageFile({
                name,
                force,
                ...(build as any)
            }, true)
        }
        
        // Check Custom Builds
        else {

            const shouldBuild = mustBuild({
                name,
                out,
                force
            })

            if (!shouldBuild) return out
        }

        // Dynamic Configuration
        if (typeof build === 'function') {
            const ctx = {
                package: packageFile
            }

            build = await build.call(ctx, {
                name,
                src,
                out,
                force
            })
        }

        if (typeof build === 'string') {
            if (existsSync(build)) return build
            await spawnProcess(build)
            return out
        }
}

// Derive assets to be transferred to the Commoners folder

// NOTE: A configuration file is required because we can't transfer plugins between browser and node without it...

export const getAssets = async ( config: UserConfig, toBuild: AssetsToBuild = {} ) => {
    
    const resolvedConfig = await resolveConfig(config)

    const { root, target } = resolvedConfig

    const configPath = resolveConfigPath(root)

    const configExtensionTargets: ['cjs', 'mjs'] = ['cjs', 'mjs']

    const isElectronTarget = target === 'electron'

    // Transfer configuration file and related services
    const assets: AssetsCollection = {
        copy: [],
        bundle: []
    }

    if (toBuild.frontend !== false) {


        if (config.__root) {

                const multiBuildConfig = {
                    'ROOT': {
                        file: 'commoners.root',
                        input: config.__root
                    },
                    'EXTENSION': {
                        file: 'commoners.extension',
                        input: configPath
                    }
                }


                const mergeCode = {

                    // On the backend (e.g. Electron), the properties handled will be identical to the raw configuration files
                    cjs:  {
                        imports: `const { join, relative } = require('path')\nconst { existsSync } = require('fs')`,
                        text: `
                        const isObject = (o) => o && typeof o === "object" && !Array.isArray(o);
    
                        const transform = (path, value) => {
                            
                            if (path[0] === 'builds') return undefined
    
                            if (value && typeof value === 'string') {
                                const CWD = "${process.cwd()}"
                                if (existsSync(value))  {
                                    const configPath = "${dirname(configPath)}"
                                    const rel = relative(configPath, join(CWD, value))
                                    return rel
                                }
                            }
                            
                            // Provide original value
                            return value
                        }
    
                        const merge = (toMerge = {}, target = {}, _path = []) => {
    
                            for (const [k, v] of Object.entries(toMerge)) {
                                const targetV = target[k];
                                const updatedPath = [..._path, k];
                                const updatedV = transform(updatedPath, v);
    
                                if (Array.isArray(updatedV) && Array.isArray(targetV)) target[k] = [...targetV, ...updatedV];
                                else if (isObject(updatedV) || isObject(targetV)) target[k] = merge(v, target[k], updatedPath);
                                else target[k] = updatedV; // Replace primitive values
                            }
                        
                            return target;
                        }
        
                        const transposedConfig = merge(COMMONERS_ROOT, {})
                        return merge(COMMONERS_EXTENSION, transposedConfig)
                    `
                    },

                    // On the browser, the properties handled will be sanitized
                    mjs: {
                        imports: '',
                        text: ` 
                        const isObject = (o) => o && typeof o === "object" && !Array.isArray(o);
    
                        const merge = (toMerge = {}, target = {}) => {

                            for (const [k, v] of Object.entries(toMerge)) {
                                const targetV = target[k];    
                                if (Array.isArray(v) && Array.isArray(targetV)) target[k] = [...targetV, ...v];
                                else if (isObject(v) || isObject(targetV)) target[k] = merge(v, target[k]);
                                else target[k] = v; // Replace primitive values
                            }
                        
                            return target;
                        }
    
    
                        const transposedConfig = merge(COMMONERS_ROOT, {})
                        return merge(COMMONERS_EXTENSION, transposedConfig)
                        `
                    }
                }


                // Ensure that the configuration file is built

                const mutualImports = {
                    mjs: Object.entries(multiBuildConfig).map(([id, { file }]) => `import COMMONERS_${id} from './${file}.mjs'`).join('\n'),
                    cjs: Object.entries(multiBuildConfig).map(([id, { file }]) => `const COMMONERS_${id} = require('./${file}.cjs').default`).join('\n')
                }


                // Build both files
                assets.bundle.push(...configExtensionTargets.map(ext => {
                    return Object.values(multiBuildConfig).map(({ file, input }) => {
                        return { input, output: `${file}.${ext}` }
                    })
                }).flat())


                // Link all files together in a master file
                assets.bundle.push(...configExtensionTargets.map(ext => { 
                    if (ext === 'cjs') {
                        return { 
                            text: `
                            ${mergeCode.cjs.imports}\n
                            ${mutualImports.cjs}\n
                            module.exports = {
                                default: (() => { ${mergeCode.cjs.text} })()
                            }
                            `, 
                            output: `commoners.config.${ext}` 
                        }
                    } else {
                        return { 
                            text: `
                            ${mergeCode.mjs.imports}\n
                            ${mutualImports.mjs}\n
                            export default (() => { ${mergeCode.mjs.text} })()
                            `, 
                            output: `commoners.config.${ext}` 
                        }
                    }

                }))

        } else {

            // Create Config
            assets.bundle.push(...configExtensionTargets.map(ext => { return configPath ? {
                input: configPath,
                output: `commoners.config.${ext}`
            } : { text: ext === 'cjs' ? "module.exports = {default: {}}" : "export default {}", output: `commoners.config.${ext}` } }))

        }


        // Bundle onload script for the browser
        assets.bundle.push({
            input: join(rootDir, 'templates', 'onload.ts'),
            output: 'onload.mjs'
        })


        // Copy Icons
        if (resolvedConfig.icon) {

            const icons = (typeof resolvedConfig.icon === 'string') ? [resolvedConfig.icon] : Object.values(resolvedConfig.icon)

            assets.copy.push(...icons as string[])
        }


    }

    if (isElectronTarget) {

        // Copy .env file if it exists
        const envPath = join(root, '.env')
        if (existsSync(envPath)) assets.copy.push(envPath)

        // Bundle Splash Page
        const splashPath = resolvedConfig.electron.splash
        if (splashPath) {
            assets.bundle.push({
                input: join(root, splashPath),
                output: splashPath
            })
        }

    }
    
    // Handle Provided Services
        const resolvedServices = resolvedConfig.services as ResolvedConfig['services']
        
        for (const [name, resolvedService] of Object.entries(resolvedServices)) {

            // @ts-ignore
            const { src, base, build, filepath } = resolvedService

            const toCopy = base ?? src

            if (!toCopy) continue // Cannot copy if no source has been specified

            const isURL = isValidURL(src)


            if (build && isURL && isElectronTarget) continue // Do not copy if file is a url (Electron-only)

            
            if (!isURL) {

                const { __src, bundle } = resolvedService as any

                if (__src) {

                        const output = await buildService({ src: __src, build, out: join(root, toCopy) }, name, toBuild.services ?? true) // Always rebuild services
                                
                        if (existsSync(output)) assets.copy.push({ 
                            input: output, 
                            extraResource: true, 
                            sign: true // jsExtensions.includes(extname(__src)) 
                        }) // Only auto-sign JavaScript files
                        
                        else console.error(`Could not resolve ${chalk.red(name)} source file: ${output}`)
                        
                } 
                
                else if (bundle) assets.bundle.push({ input: join(root, src), output: filepath, force: true })
            }
        }

    return assets
}


export const clear = (outDir: string) => {
    if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true }) // Clear output directory (similar to Vite)
}

type AssetsToBuild = {
    services?: boolean,
    frontend?: boolean
}

export const buildAssets = async (config: ResolvedConfig, toBuild: AssetsToBuild = {}) => {

    const { outDir } = config.build

    if (toBuild.frontend !== false) {

        mkdirSync(outDir, { recursive: true }) // Ensure base and asset output directory exists
 
        // Write a package.json file to ensure these files are treated properly
        const randomId = Math.random().toString(36).substring(7)
        writeFileSync(join(outDir, 'package.json'), JSON.stringify({ name: `commoners-build-${randomId}`, version: config.version }, null, 2)) // Write package.json to ensure these files are treated as commonjs
    }

    // Get other assets to be copied / bundled
    const assets = await getAssets(config, toBuild)

    const outputs: AssetOutput[] = []

    const { root } = config

    // Create an assets folder with copied assets (ESM)
    await Promise.all(assets.bundle.map(async info => {

        const isString = typeof info === 'string'
        const output = isString ? null : info.output

        // Just copy text to the output file
        if (typeof info !== 'string' && 'text' in info) {
            if (typeof output === 'string') return writeFileSync(join(outDir, output), info.text)
            else return // Nowhere to write the text
        }
        
        // Transform an input file in some way
        const input = isString ? info : info.input
        const hasExplicitInput = typeof input === 'string'
        const force = isString ? false : info.force
    
        if (hasExplicitInput) {
    
            const ext = extname(input)
    
            // NOTE: Output is always taken literally
            const outPath = typeof output === 'string' ? (force ? output : join(outDir, output)) : (() => {
                const relPath = isAbsolute(input) ? relative(root, input) : input
                return join(outDir, relPath)
            })()
    
            const fileRoot =  dirname(input)

            // Bundle HTML Files using Vite
            if (ext === '.html') {

                await vite.build({
                    logLevel: 'silent',
                    base: "./",
                    root: fileRoot,
                    build: {
                        emptyOutDir: false, // Ensure assets already built are maintained
                        outDir: relative(fileRoot, dirname(outPath)),
                        rollupOptions: { input }
                    },
                })

            } else{

                const extension = typeof output === 'string' ? extname(output).slice(1) : (output?.extension ?? ext.slice(1))
                const resolvedExtension = bundleExtensions.includes(`.${extension}`) ? 'js' : extension

                // Correct for invalid extensions
                const _outfile = join(dirname(outPath), `${parse(input).name}.${resolvedExtension}`)
                const outfile = outPath.endsWith(resolvedExtension) ? outPath : _outfile

                const baseConfig: esbuild.BuildOptions = {
                    entryPoints: [ input ],
                    bundle: true,
                    logLevel: 'silent',
                    outfile
                }

                // Force a build format if the proper extension is specified
                const format = resolvedExtension === 'mjs' ? 'esm' : resolvedExtension === 'cjs' ? 'cjs' : undefined

                const buildForNode = () => buildForBrowser({ 
                    platform: 'node', 
                    external: [ "*.node" ] 
                })
                
                const buildForBrowser = (opts = {}) => esbuild.build({ ...baseConfig, format, ...opts})
                
                if (ext === 'cjs') await buildForNode()
                else await buildForBrowser().catch(buildForNode) // Externalize all node dependencies

                // Handle extra resources
                const assetOutputInfo: AssetOutput = { file: outfile }
                if (typeof info === 'object')  {
                    assetOutputInfo.extraResource = info.extraResource
                    assetOutputInfo.sign = info.sign
                }

                outputs.push(assetOutputInfo)
            }

        }

        else console.error(`Could not resolve ${chalk.red(input)} asset file`)

    }))


    // Copy static assets
    assets.copy.map(info => {
        const isObject = typeof info === 'object'
        const file = isObject ? info.input : info
        const output: AssetOutput = { file: copyAsset(file, { outDir, root }) }

        // Handle extra resources
        if (isObject) {
            output.extraResource = info.extraResource
            output.sign = info.sign
        }
        
        outputs.push(output)
    })

    return outputs
}