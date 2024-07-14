import chalk from "chalk";
import { spawn } from "node:child_process";

let children = {}

const kill = (code) => {
    for (const child in children) children[child].kill()
    // process.exit();
}

// Ensure all processes are killed
process.on('uncaughtException', (e) => {
    console.error(e)
    kill()
})

process.on('beforeExit', kill);


export const runCommand = async (string, options) => {
    const splitCommand = string.split(' ')
    const [command, ...args] = splitCommand
    await spawnProcess(command, args, options)
}

export const spawnProcess = (
    command, 
    args, 
    { env = {}, opts = {}, cwd } = {}
) => {
    return new Promise((resolve) => {
        
        // NOTE: We don't need this in production builds...
        const customPath = `${process.cwd()}/node_modules/.bin`  // Include this library's node_modules in the PATH

        const proc = spawn(command, args, { 
            shell: true, 
            env: {
                ...env,
                PATH: `${process.env.PATH}:${customPath}`
            },
            cwd
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