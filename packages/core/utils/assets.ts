// Built-In Modules
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, extname, join, parse, relative, isAbsolute, resolve, normalize, sep, posix, basename } from "node:path"
import { pathToFileURL } from "node:url"



// Internal Imports
import { resolveConfig, resolveConfigPath } from "../index.js"
import { copyAsset, copyAssetOld } from './copy.js'
import { encodePath } from "./encode.js"
import { chalk, isDesktop, rootDir, vite } from "../globals.js"
import { spawnProcess } from './processes.js'
import { ResolvedConfig, ResolvedService, UserConfig } from "../types.js"
import { isValidURL } from './url.js'
import { withExternalBuiltins } from "../vite/plugins/electron/inbuilt.js"
import { printSubtle } from "./formatting.js"

import { resolveViteConfig } from "../vite/index.js"
import { mergeConfig } from "vite"

type ESBuildBuildOptions = import('esbuild').BuildOptions

type AssetMetadata = {
    extraResource?: boolean,
    sign?: boolean
}

type BuildInfo = {
    src: string,
    out: string,
}

type BuildFunction = (info: BuildInfo) => string

type CoreAssetInfo = string | {
    input: string,
    output?: string
    force?: boolean,
    compile?: BuildFunction | boolean // Function to compile the asset
} & AssetMetadata

type AssetInfo = CoreAssetInfo | { text: string, output: string }

type AssetOutput = { file: string } & AssetMetadata

type AssetsCollection = {
    copy: CoreAssetInfo[],
    bundle: AssetInfo[]
}

const bundleExtensions = [ '.ts' ]
const jsExtensions = ['.js', '.mjs', '.cjs', ...bundleExtensions]


const getAbsolutePath = (root: string, path: string) => isAbsolute(path) ? path : join(root, path)


// Intelligently build service only if it hasn't been built yet (unless forced)
const mustBuild = ({ outDir, force }) => {
    const hasBeenBuilt = existsSync(outDir)
    if (hasBeenBuilt && !force) return false
    return true
}

const getBuildDir = (outDir: string) => join(resolve(outDir), 'assets')

const sharedWithElectron = [ 'commoners.config.cjs' ]

export const getAssetBuildPath = (assetPath: string, outDir: string, isSharedWithElectron?: boolean) => {
    const inputToCompare = assetPath.replaceAll(sep, posix.sep)  
    if (isSharedWithElectron === undefined) isSharedWithElectron = sharedWithElectron.includes(inputToCompare)
    if (isSharedWithElectron) return join(getBuildDir(outDir), assetPath) // Ensure consistently resolved by Electron
    const buildDir = getBuildDir(outDir)
    const encoded = encodePath(assetPath)
    return join(buildDir, encoded)
}

export const getAssetLinkPath = (
    path, 
    outDir, 
    root = outDir
) => {


    // Get the absolute path of the asset
    const absOutPath = getAssetBuildPath(path, outDir)
    const resolvedRoot = resolve(root)

    // Get the relative path of the asset
    let outPath = normalize(relative(resolvedRoot, absOutPath))
    if (!(outPath[0] === sep)) outPath = sep + outPath
    if (!(outPath[0] === '.')) outPath = '.' + outPath
    const result = outPath.replaceAll(sep, posix.sep)
    return result

}



type PackageInfo = {
    name: string,
    force?: boolean,
    src: string, // Absolute Source File
    out: string, // Absolute Output File
}

export const packageFile = async (info: PackageInfo) => {

    const _chalk = await chalk

    const { 
        name, 
        src, 
        out,
        force
    } = info

    const outDir = dirname(out)
    const outName = basename(out, extname(out))

    const tempOut = join(outDir, outName) + '.js'

    const shouldBuild = mustBuild({ outDir: outDir, force })

    if (!shouldBuild) {
        printSubtle(`Skipping ${_chalk.bold(name)} build`)
        return outDir
    }

    const esbuild = await import('esbuild')
    const pkg = await import('pkg')

    await esbuild.build({ 
        entryPoints: [ src ],
        bundle: true,
        logLevel: 'silent',
        outfile: tempOut,
        format: 'cjs', 
        platform: 'node', 
        external: [ "*.node" ]
    })

    await pkg.exec([
        tempOut, 
        '--target', 
        'node16', 
        '--out-path', 
        outDir
    ]);

    rmSync(tempOut, { force: true })

    return outDir
}


async function buildService(
    { 
        build,
        out,
        src,
        root
    }: { 
        src: string,
        out: string,
        build: ResolvedService['build'],
        root: ResolvedConfig['root']
    }, 
    name, 
    force = false
){

    const _chalk = await chalk

    out = resolve(out)
    
    console.log(`\n👊 Packaging ${_chalk.bold(name)} service\n`)

    const buildInfo = { name, src, out, force }
    
    // Dynamic Configuration
    if (typeof build === 'function') {

        const ctx = { package: packageFile }

        build = await build.call(ctx, buildInfo)

    }
    

    // Handle string build commands
    if (typeof build === 'string') {

        // Output path
        if (existsSync(build)) return build 

        // Terminal Command
        await spawnProcess(build, [], { cwd: root })
        
    }

    // Auto Build Configuration
    else return packageFile(buildInfo)

}

// Derive assets to be transferred to the Commoners folder

// NOTE: A configuration file is required because we can't transfer plugins between browser and node without it...

export const getAssets = async ( config: UserConfig, toBuild: AssetsToBuild = {} ) => {

    const _chalk = await chalk
    
    const resolvedConfig = await resolveConfig(config)

    const { root, target } = resolvedConfig
    const { outDir } = resolvedConfig.build

    const configPath = resolveConfigPath(root)

    const configExtensionTargets = [
        'cjs', 
        'mjs' // Fails for Node.js dependencies (e.g. @commoners/solidarity)
    ]

    const isElectronTarget = target === 'electron'

    // Transfer configuration file and related services
    const assets: AssetsCollection = {
        copy: [],
        bundle: []
    }

    if (toBuild.assets !== false) {

        // Create Config
        assets.bundle.push(...configExtensionTargets.map(ext => { 
            const output = `commoners.config.${ext}`
            return configPath ? { input: configPath, output } : { text: ext === 'cjs' ? "module.exports = {default: {}}" : "export default {}", output }
        }))

        // Bundle onload script for the browser
        assets.bundle.push({
            input: join(rootDir, 'templates', 'onload.ts'),
            output: 'onload.mjs'
        })


        // Copy Icons
        if (resolvedConfig.icon) {
            const icons = (typeof resolvedConfig.icon === 'string') ? [ resolvedConfig.icon ] : Object.values(resolvedConfig.icon)
            assets.copy.push(...icons.map(icon => getAbsolutePath(root, icon)) as string[])
        }


    }

    if (isElectronTarget) {
        const splashPath = resolvedConfig.electron.splash
        if (splashPath) assets.bundle.push({ input: getAbsolutePath(root, splashPath), output: splashPath })
    }

    // Handle Provided Plugins
    for (const [ id, plugin ] of Object.entries(resolvedConfig.plugins)) {
        const assetsCopy = structuredClone(plugin.assets ?? {})
        Object.entries(assetsCopy).map(([ key, fileInfo ]) => {
            const fileInfoDictionary = typeof fileInfo === 'string' ? { src: fileInfo } : fileInfo
            const { src,  overrides }  = fileInfoDictionary
            const absPath = getAbsolutePath(root, src)

            // const dir = dirname(src) // NOTE: This may overwrite files that are named the same
            const filename = basename(src)

            const assetPath = join('plugins', id, key, filename)
            const outPath = getAssetBuildPath(assetPath, outDir, true) // Always resolve in a way that's consistent with Electron

            assets.bundle.push({ 
                input: absPath, 
                output: outPath, 
                force: true, // Ensure strict output location
                config: overrides,
            })
            
            assetsCopy[key] = outPath
        })

        if (plugin.assets) plugin.assets = assetsCopy
    }
    
    // Handle Provided Services
    const resolvedServices = resolvedConfig.services as ResolvedConfig['services']
    
    for (const [ name, resolvedService ] of Object.entries(resolvedServices)) {

        // @ts-ignore
        const { __src, src, base, build, publish, filepath, __compile } = resolvedService

        const isDesktopBuild = isDesktop(target)
        if (isDesktopBuild && isValidURL(src)) continue // Skip remote services for desktop builds

        const toPublish = base ? resolve(root, base) : filepath

        // Build for production
        if ( publish ){

            if (
                __src 
                && ( isDesktopBuild || toBuild.services )
            ) {

                const output = await buildService(
                    { 
                        src: __src, 
                        build, 
                        out: filepath,
                        root
                    }, 
                    name, 
                    true // Always rebuild services
                )

                const willCopy = output === null ? null : output ?? toPublish
                        
                // Only auto-sign JavaScript files
                if (typeof willCopy === 'string') {

                    if (existsSync(willCopy)) assets.copy.push({ 
                        input: willCopy, 
                        extraResource: true, 
                        sign: true // jsExtensions.includes(extname(__src)) 
                    })
                    
                    else console.log(`${_chalk.bold(`Missing ${_chalk.red(name)} build file`)}\nCould not find ${willCopy}`)
                    
                }

            } 
            
        }

        // Compile for development use
        else if (__compile) assets.bundle.push({ 
            input: __src,
            output: filepath, 
            force: true, 
            compile: __compile 
        })

        
    }

    return assets
}


export const clear = (outDir: string) => {
    if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true }) // Clear output directory (similar to Vite)
}

type AssetsToBuild = { assets?: boolean, services?: boolean }

export const buildAssets = async (config: ResolvedConfig, toBuild: AssetsToBuild = {}, dev = false) => {

    const _chalk = await chalk
    const _vite = await vite

    const { outDir } = config.build

    if (toBuild.assets !== false) {

        mkdirSync(outDir, { recursive: true }) // Ensure base and asset output directory exists
 
        // Write a package.json file to ensure these files are treated properly
        const randomId = Math.random().toString(36).substring(7)
        writeFileSync(join(outDir, 'package.json'), JSON.stringify({ 
            name: `commoners-build-${randomId}`, 
            version: config.version,
            // type: 'module'
        }, null, 2)) // Write package.json to ensure these files are treated as commonjs
    }

    // Get other assets to be copied / bundled
    const assets = await getAssets(config, toBuild)

    const outputs: AssetOutput[] = []

    const { root } = config

    // Create an assets folder with copied assets (ESM)
    await Promise.all(assets.bundle.map(async info => {

        // Just copy text to the output file
        if (typeof info !== 'string' && 'text' in info) {
            const { output } = info
            if (typeof output === 'string') {
                const outPath = getAssetBuildPath(output, outDir)
                mkdirSync(dirname(outPath), { recursive: true }) // Ensure base and asset output directory exists
                return writeFileSync(outPath, info.text)
            }
            else return // Nowhere to write the text
        }

        // Proceed with bundling
        const isString = typeof info === 'string'
        const output = isString ? null : info.output

        
        // Transform an input file in some way
        const input = isString ? info : info.input
        const hasExplicitInput = typeof input === 'string'
        const force = isString ? false : info.force
        const compile = isString ? false : info.compile

        if (hasExplicitInput) {
    
            const ext = extname(input)
    
            const absPath = getAbsolutePath(root, input)

            // NOTE: Output is always taken literally
            const outPath = typeof output === 'string' ? (force ? output : getAssetBuildPath(output, outDir)) : getAssetBuildPath(absPath, outDir)
    
            const fileRoot =  dirname(input)

            // Handle custom compilation commands
            if (typeof compile === 'function') {
                const result = await compile({ src: input, out: outPath })
                if (typeof result === 'string') await spawnProcess(result, [], { cwd: root }) // Execute returned commands
            }

            // Bundle HTML Files using Vite
            else if (ext === '.html') {
                const { target } = config
                const { config: commonersConfig } = info

                const outDir = dirname(outPath)

                // Default Build Configuration
                const buildConfig = {
                    logLevel: 'silent',
                    base: "./",
                    root: fileRoot,
                    build: {
                        emptyOutDir: false, // Ensure assets already built are maintained
                        outDir, // Configure the output directory of the linked build assets
                        rollupOptions: { input } 
                    },
                }


                // Treat as Commoners Frontend with Configuration Specified 
                if (commonersConfig) {

                    const mergedConfig = {...config, ...commonersConfig, root: fileRoot }
                    
                    const viteConfig = await resolveViteConfig(mergedConfig, { 
                        target, 
                        outDir, // Provide a new outDir to link to the original (provided by the mergedConfig above)
                        dev 
                    }, false)
                    
                    const mergedViteConfig = mergeConfig(viteConfig, buildConfig)
                    await _vite.build(mergedViteConfig)
                }

                else await _vite.build(buildConfig)

            } else {

                const extension = typeof output === 'string' ? extname(output).slice(1) : ext.slice(1)
                const resolvedExtension = bundleExtensions.includes(`.${extension}`) ? 'js' : extension

                // Correct for invalid extensions
                const _outfile = join(dirname(outPath), `${parse(input).name}.${resolvedExtension}`)


                const outfile = outPath.endsWith(resolvedExtension) ? outPath : _outfile

                if (basename(input, extname(input)) == 'commoners.config') await bundleConfig(input, outfile) // Bundle config file differently using Rollup
                else {

                    const baseConfig: ESBuildBuildOptions = {
                        entryPoints: [ input ],
                        bundle: true,
                        logLevel: 'silent',
                        outfile
                    }

                    // Force a build format if the proper extension is specified
                    const format = resolvedExtension === 'mjs' ? 'esm' : resolvedExtension === 'cjs' ? 'cjs' : undefined

                    const esbuild = await import('esbuild')

                    const buildForNode = () => buildForBrowser({ 
                        outfile,
                        platform: 'node', 
                        external: [ "*.node" ] 
                    })
                    
                    const buildForBrowser = (opts = {}) => esbuild.build({ ...baseConfig, format, ...opts})
                    
                    if (ext === 'cjs') await buildForNode()
                    else await buildForBrowser().catch(buildForNode) // Externalize all node dependencies
                }


                // Handle extra resources
                const assetOutputInfo: AssetOutput = { file: outfile }
                if (typeof info === 'object')  {
                    assetOutputInfo.extraResource = info.extraResource
                    assetOutputInfo.sign = info.sign
                }

                outputs.push(assetOutputInfo)
            }
        }

        else console.error(`Could not resolve ${_chalk.red(input)} asset file`)

    }))


    // Copy static assets
    assets.copy.map(info => {

        const isObject = typeof info === 'object'
        const file = isObject ? info.input : info
        const locationToEncode = (isObject ? info.output : undefined) ?? file

        const extraResource = isObject ? info.extraResource : false

        // Ensure extra resources are copied to the output directory
        const output: AssetOutput = { file: extraResource ? copyAssetOld(file, { outDir, root }) : copyAsset(file, getAssetBuildPath(locationToEncode, outDir)) } 

        // Handle extra resources
        if (isObject) {
            output.extraResource = extraResource
            output.sign = info.sign
        }
        
        outputs.push(output)
    })

    return outputs
}


const importMetaResolvePlugin = () => {
    return {
        name: 'import-meta-resolve',
        resolveImportMeta: (_, { moduleId }) => `"${pathToFileURL(moduleId)}"` // Custom import.meta.url value
    }
}

export const bundleConfig = async ( input, outFile, { node = false } = {} ) => {

    const _vite = await vite

    const logLevel = 'silent'
    const outDir = dirname(outFile)
    const outFileName = basename(outFile)
    const extension = extname(outFile)

    const format = extension === '.mjs' ? 'es' : extension === '.cjs' ? 'cjs' : undefined
    

    const plugins = []

    const root =  dirname(input)

    if (!node) {
        const nodePolyfills = await import('vite-plugin-node-polyfills').then(({ nodePolyfills }) => nodePolyfills)
        plugins.push(nodePolyfills())
    }

    const config = _vite.defineConfig({
        logLevel,
        base: "./",
        root,

        plugins: plugins,

        build: {
            lib: {
                entry: input,
                formats: [ format ],
                fileName: () => outFileName,
            },
            emptyOutDir: false,
            outDir,

            rollupOptions: { 
                plugins: [ 
                    importMetaResolvePlugin() // Ensure import.meta.url is resolved correctly within each source file
                ] 
            }
        }

    })
    
    const resolvedConfig = node ? withExternalBuiltins(config) : config

    const results = await _vite.build(resolvedConfig) as any[] // RollupOutput[]

    // Always return a flat list of the output file locations
    return results.map(({ output }) => output).flat().map(({ fileName }) => join(outDir, fileName))

}