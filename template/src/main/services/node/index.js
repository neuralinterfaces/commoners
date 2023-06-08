import { fork } from "node:child_process"


export default ({ abspath, port }) => {
    return fork(abspath, [ port ], { silent: true })
}