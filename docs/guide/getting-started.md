# Getting Started
Welcome to Commoners! This guide will help you get started with building your first cross-platform application.

Since Commoners is built on top of [Vite](https://vitejs.dev), you can use the `create-vite` package to scaffold a new project. To do this, run the following command in your terminal:

```bash
npm create vite@latest my-commoners-app
```

Follow the prompts to select your favorite framework and features.

## Installing `commoners`
After running `npm install`, add Commoners as a dependency:

```bash
npm install commoners
```

## Configuring the `package.json` File
Then, modify `scripts` in your `package.json` to include the following:

```json
{
    "scripts": {
        "start": "commoners --target desktop",
        "dev": "commoners",
        "build": "npm run build:desktop",
        "build:web": "commoners build",
        "build:desktop": "commoners build --target desktop"
    }
}
```

Now you can run `npm start` to start your application as an Electron desktop application, `npm run dev` to start your application as a web application, and the tagged `npm run build` commands to create different distributions of your application.


## Getting Started
`commoners` allows you to customize your application by adding a `commoners.config.js` file to the root of your project. This file can be used to configure your application's services, plugins, and more.

For example, you can add the following to your `commoners.config.js` file to customize your application's name and icon:

```js
export default {
    name: 'My App',
    icon: './assets/vite.png', // Manually converted from public/vite.svg
}
```

All of the available configuration options are documented in the [Configuration](./config.md) documentation.

In your built application, you can access Commoners configuration values using the `commoners` object:

```js
console.log(commoners) // { NAME: 'My App', VERSION: '0.0.0', ICON: '<path>', DESKTOP: true, READY: Promise, SERVICES: { ... } }
```

Try replacing the default `h1` and `img` tags with your custom `NAME` and `ICON` using the `commoners` global variable!

## Adding Services
To add services to your Commoners application in development, simply add fill out the `services` property of the configuration file.

```js
export default {
    // ...
    services: {
        node: './src/services/node.js',
        tsNode: './src/services/node.ts',
        python: './src/services/python.py',
    }
}
```

We currently support JavaScript, TypeScript, and Python services.

1. **JavaScript / TypeScript**: Reference a `.js` or `.ts` file to run using [Node.js](https://nodejs.org).
2. **Python**: Reference a `.py` file to run using [Python](https://www.python.org).
    - Ensure that you're running a virtual environment with the necessary dependencies. We recommend using [miniconda](https://docs.conda.io/en/latest/miniconda.html) and distributing an `environment.yml` file with your project.
    
For all services, you'll want to ensure that CORS is enabled to support communication between the service and the application.

### Example Services

#### JavaScript / TypeScript
Here is an example HTTP server written in TypeScript.

```ts
import http from 'node:http';

const host = process.env.HOST
const port = process.env.PORT

const server = http.createServer((
    _: http.IncomingMessage,
    res: http.ServerResponse
) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello World\n');
});

server.listen(port, 
    () => console.log(`Server running at http://${host}:${port}/`)
);
```

#### Python
Here is an example HTTP server written in Python.

```python
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

class SimpleHTTPRequestHandler(BaseHTTPRequestHandler):
    def _set_headers(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/plain')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'X-Requested-With,content-type')
        self.end_headers()

    def do_GET(self):
        self._set_headers()
        self.wfile.write(b'Hello, world!')

PORT = int(os.getenv('PORT', 8000))
HOST = os.getenv('HOST', '')

server_address = (HOST, PORT)
httpd = server_class(server_address, handler_class)
httpd.serve_forever()
```

### Using Services
To use services in your application, you can import them using the `commoners` global variable:

```js
const { SERVICES } = commoners
const nodeServiceUrl = SERVICES.node.url
const tsNodeServiceUrl = SERVICES.tsNode.url
const pythonServiceUrl = SERVICES.python.url
```


Use the following code snippet and update the button to fetch data from your services!

```js
const responses = await Promise.allSettled(Object.values(SERVICES).map(({ url }) => fetch(url).then(response => response.text())))
```

## Building for Production
The general policy for service builds is that **service builds are deferred to the user**—unless you're building for Desktop. 

In these cases, you'll have to build services using the following command:
    
```bash
commoners build --service node --service tsNode
```

### Services
To configure your services for production, you'll have to follow language-specific instructions. 

#### JavaScript / TypeScript
JavaScript and TypeScript services are auto-bundled using [esbuild](https://esbuild.github.io) and [pkg](https://www.npmjs.com/package/pkg). 

To package these for distribution and/or indicate they'll be hosted on a remote server, you'll add the following configuration:

```js
export default {
    // ...
    services: {

        // Simple configuration
        node: './src/services/node.js', // Only included with Desktop builds

        // Advanced configuration
        tsNode: {
            src: './src/services/node.ts',
            // url: undefined, // Removed on remote builds (web, mobile)
            // url: 'https://ts-node.example.com', // Remote for all builds (web, mobile, desktop)
            // url: { remote: 'https://ts-node.example.com' }, // Remote for remote builds (web, mobile). Local for local builds (desktop)
            url: { local: 'https://ts-node.example.com' }, // Remote for local builds (desktop). Removed on remote builds (web, mobile)
        }
    }
}
```

#### Python
For Python services, you'll to specify a terminal command that will bundle the service into a standalone executable file. We recommend using `pyinstaller` for this purpose.

```js
export default {
    // ...
    services: {

        python: {
            src: './src/services/python.py',
            url: { remote: 'https://python.example.com' },

            // The build command
            build: 'python -m PyInstaller --name python-service --onedir --clean ./src/services/python.py --distpath ./build/python',

            // What to include from the build
            publish: {
                base: './build/python/python-service', // The base directory to copy
                src: 'python-service', // The relative source location in the base directory
            }
        }
    }
}
```

## Release Automation using GitHub Actions
Coming soon...