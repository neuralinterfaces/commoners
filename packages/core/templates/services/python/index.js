import { spawn } from 'node:child_process';

export default (filepath, env = {}) => spawn("python", [filepath], { env })