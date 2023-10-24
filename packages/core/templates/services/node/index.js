import { fork } from "node:child_process"


export default ({ src, port, host }) => fork(src, [ ], { silent: true, env: { ...process.env, PORT: port, HOST: host } })