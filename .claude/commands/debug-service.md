Debug a failing service. The service name/type is: $ARGUMENTS

Investigation steps:
1. Find the service definition in the demo config or relevant config file
2. Check the service source code for obvious issues
3. Check service build output paths (dev: `.commoners/.tmp/services/`, build: `.commoners/services/`)
4. Look for port conflicts (especially port 2345)
5. Check if the service requires special environment (conda for Python, cargo for Rust, g++ for C++)
6. Review recent changes to service-related code in `packages/core/`

Report: root cause analysis, suggested fix, and any related known issues from test history.
