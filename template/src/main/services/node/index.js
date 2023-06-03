import { fork } from "child_process"


export default ({ abspath, port }) => {
    return fork(abspath, [ port ], { silent: true })
}