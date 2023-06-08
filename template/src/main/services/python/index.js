import { execFile, spawn } from 'node:child_process';

export default function createPythonProcess ({ file, port }) {
    const isPackaged = false
    const process = (isPackaged) ?  execFile(file, [port]) : spawn("python", [file, port])
    return process
};