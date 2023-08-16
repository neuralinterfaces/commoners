import * as bluetooth from './devices/ble/index.js'
import * as serial from './devices/serial/index.js'

import * as autoupdate from './autoupdate/index.js'

export const plugins = [
    autoupdate,
    bluetooth,
    serial
]

export default plugins