import chalk from "chalk";
import { spawn } from "child_process";
import { __dirname } from "../globals.js";



let children = {}

export const spawnProcess = (command, args) => {
    return new Promise((resolve, reject) => {
        
        const proc = spawn(command, args, { 
            shell: true, 
            env: {
                ...process.env,
                PATH: `${process.env.PATH}:${__dirname}/node_modules/.bin` // Include this library's node_modules in the PATH
            }
        });

        children[proc.pid] = proc

        proc.stdout.on('data', (data) => console.log(chalk.gray(data.toString())));
        
        proc.stderr.on('data', reject);

        proc.on('data', (data) => console.log(chalk.gray(data.toString())));

        proc.on('error', reject)
        
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