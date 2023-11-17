import { fork } from "node:child_process"


export default ({ src },  env = {}) => fork(src, [ ], { silent: true, env })