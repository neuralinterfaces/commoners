import { fork } from "node:child_process"


export default ({ abspath, port, host }) => fork(abspath, [ ], { silent: true, env: { ...process.env, PORT: port, HOST: host } })