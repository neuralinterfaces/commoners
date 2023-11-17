import { spawn } from 'node:child_process';

export default ({ src }, env = {}) => spawn("python", [src], { env })