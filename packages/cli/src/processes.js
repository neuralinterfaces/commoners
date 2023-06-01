import chalk from "chalk";
import { spawn } from "child_process";
import { __dirname } from "../globals.js";

let children = {}

export const runCommand = async (string) => {
    const splitCommand = string.split(' ')
    const [command, ...args] = splitCommand
    await spawnProcess(command, args)
}

export const spawnProcess = (command, args, customEnv = {}) => {
    return new Promise((resolve) => {
        
        const proc = spawn(command, args, { 
            shell: true, 
            env: {
                ...customEnv,
                PATH: `${process.env.PATH}:${__dirname}/node_modules/.bin` // Include this library's node_modules in the PATH
            }
        });

        children[proc.pid] = proc

        proc.stdout.on('data', (data) => console.log(chalk.gray(data.toString())));
        
        proc.stderr.on('data', (e) => {
            throw e
        });

        proc.on('data', (data) => console.log(chalk.gray(data.toString())));

        proc.on('error',(e) => {
            throw e
        });
        
        proc.on('exit', (res) => {
            delete children[proc.pid]
            resolve(res)
        });
    })

}

export const onExit = (code) => {
    for (const child in children) children[child].kill()
    process.exit();
}