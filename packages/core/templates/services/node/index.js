import { fork } from "node:child_process"


export default (filepath,  env = {}) => fork(filepath, [ ], { silent: true, env })