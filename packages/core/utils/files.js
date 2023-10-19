import path from 'node:path';
import fs from 'node:fs'
import chalk from 'chalk';



function isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
  }

function appendDeep(target, ...sources) {
    if (!sources.length) return target;
    const source = sources.shift();
  
    if (isObject(target) && isObject(source)) {
      for (const key in source) {

        // Object Concatenation
        if (isObject(source[key])) {
          if (!target[key]) Object.assign(target, { [key]: {} });
          appendDeep(target[key], source[key]);
        } 
        
        // Array Concatenation
        else if (Array.isArray(source[key])) {
            if (!target[key]) Object.assign(target, { [key]: [] });
            target[key] = target[key].concat(source[key])
        } 
        
        // Primitive Concatenation
        else {
          Object.assign(target, { [key]: source[key] });
        }
      }
    }
  
    const res = appendDeep(target, ...sources);
    return res;
  }

export const getCurrentDirectoryBase = () => {
    return path.basename(process.cwd());
}

export const exists = (filePath) => fs.existsSync(filePath);

export const getJSON = (path) => {
    if (exists(path)) {
        let res = JSON.parse(fs.readFileSync(path));
        if (typeof res === 'string') res = JSON.parse(res) // Ensure that the JSON has been parsed
        return res
    }
    else return {};
}

export const deleteDirectory = (path) => {
    if (exists(path)) fs.rmSync(path, { recursive: true })
}

export const createDirectory = (dirpath) => {
    const dirs = dirpath.split('/')

    dirs.reduce((acc, dir) => {
        acc = path.join(acc, dir)
        if (!exists(acc)) fs.mkdirSync(acc)
        return acc
    }, path.isAbsolute(dirpath) ? '/' : '')

    return path.resolve(dirpath)
}

export const createFile = (filepath, data='', overwrite=false) => {
    
    createDirectory(path.dirname(filepath))

    const fileExists = exists(filepath)
    if (overwrite || !fileExists) {
        if (typeof data === 'function') data = data() // Allow for dynamic data
        if (filepath.includes('.json') && typeof data === 'object') {
            if (data instanceof Buffer) data = data.toString()
            data = JSON.stringify(data, null, 2) // Pretty print JSON
        }

        fs.writeFileSync(filepath, data)
        if (!fileExists) console.log(chalk.gray(`Created ${path.relative(process.cwd(), filepath)}`))
    }

    return path.resolve(filepath)
}

export const appendJSON = (filepath, jsonData) => {
    if (!exists(filepath)) throw new Error(`File does not exist: ${filepath}`)

    if (typeof jsonData === 'function') jsonData = jsonData() // Allow for dynamic data

    const data = getJSON(filepath)   
    createFile(filepath, appendDeep(data, jsonData), true)
}