import { spawn } from 'node:child_process';

export default ({ src, port }) => spawn("python", [src], { env: { ...process.env, PORT: port } })