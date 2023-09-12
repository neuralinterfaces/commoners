import chalk from "chalk";
import { spawn } from "node:child_process";
import { rootDir } from "../globals";

let children = {}

export const runCommand = async (string, customEnv, opts) => {
    const splitCommand = string.split(' ')
    const [command, ...args] = splitCommand
    await spawnProcess(command, args, customEnv, opts)
}

export const spawnProcess = (command, args, customEnv = {}, opts = { }) => {
    return new Promise((resolve) => {
        
        const customPath = `${rootDir}/node_modules/.bin`  // Include this library's node_modules in the PATH
        console.log('Adding to path', customPath)
        const proc = spawn(command, args, { 
            shell: true, 
            env: {
                ...customEnv,
                PATH: `${process.env.PATH}:${customPath}`
            }
        });

        children[proc.pid] = proc;

        if (opts.log !== false) {
            proc.stdout.on('data', (data) => console.log(chalk.gray(data.toString())));
            proc.on('data', (data) => console.log(chalk.gray(data.toString())));
            proc.stderr.on('data', (e) => { console.log(chalk.gray(e)) });
            proc.on('error',(e) => { console.log(chalk.gray(e))});
        }


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