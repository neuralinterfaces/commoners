import { fork } from "node:child_process"


export default ({ abspath, port }) => fork(abspath, [ port ], { silent: true })