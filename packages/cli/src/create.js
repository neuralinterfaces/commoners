import chalk from "chalk"
import { readFileSync } from "fs"
import path from "path"
import { commonersPkg, __dirname } from "../globals.js"
import { createDirectory, createFile, appendJSON, getJSON } from "./files.js"


const basePkg = {
    version: "0.0.1",
    type: "module",
}

export const createPackage = (name) => {

    const filepath = createFile('package.json', {
        name,
        ...basePkg,
        private: true,
        scripts: {
            start: "npm run dev",
            dev: "commoners dev",
            build: "commoners build",
            publish: "commoners publish"
        },
        devDependencies: {
            [commonersPkg.name]: `^${commonersPkg.version}`
        }
    })

    console.log(chalk.gray('Created package.json'))

    return getJSON(filepath)
}
export const createFrontend = (dir, opts) => {

    // Create Template Frontend Files
    createFile(path.join(dir, 'index.ts'), () => readFileSync(path.join(__dirname, 'src/templates/frontend/index.ts')))
    createFile(path.join(dir, 'style.css'), () => readFileSync(path.join(__dirname, 'src/templates/frontend/style.css')))
    const packagePath = createFile(path.join(dir, 'package.json'), () => readFileSync(path.join(__dirname, 'src/templates/frontend/package.json')))

    // Add dynamic name to package.json
    appendJSON(packagePath, {
        name: `${opts.name}-frontend`,
        workspaces: [dir]
    })

    // Add workespace to root package.json
    appendJSON('package.json', {
        workspaces: [dir]
    })
}


const ensureTypescriptFile = (filepath) => {
    if (!filepath.endsWith('.ts')) {
        return filepath + '.ts'
    }
    return filepath
}

export const createService = (name, entrypoint, opts) => {

    const dir = path.dirname(entrypoint)

    createDirectory(dir) // Optional Backend Creation

    const fullEntryPoint = ensureTypescriptFile(entrypoint)
    createFile(fullEntryPoint, () => readFileSync(path.join(__dirname, 'src/templates/service/index.ts')))
    const packagePath = createFile(path.join(dir, 'package.json'), () => readFileSync(path.join(__dirname, 'src/templates/service/package.json')))

    // Add dynamic name to package.json
    appendJSON(packagePath, {
        name: `${opts.name}-${name}-service`,
    })

    // Add workespace to root package.json
    appendJSON('package.json', {
        workspaces: [dir]
    })
}