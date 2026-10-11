// Aggregator: imports all test suites so `pnpm test` runs everything.
// Individual suites can be run with `pnpm test:config`, `pnpm test:start`, etc.

import './config.test'
import './start.test'
import './build.test'
import './desktop-build.test'
import './desktop.test'
import './desktop-zlaunch.test'
import './services.test'
