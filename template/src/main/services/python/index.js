import { spawn } from 'node:child_process';

export default ({ src, port, host }) => spawn("python", [src], { env: { ...process.env, PORT: port, HOST: host } })