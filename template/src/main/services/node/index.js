import { fork } from "node:child_process"


export default ({ abspath, port }) => fork(abspath, [ ], { silent: true, env: { ...process.env, PORT: port } })