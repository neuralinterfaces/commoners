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
    icon: './assets/icon.png',
}
```

All of the available configuration options are documented in the [Configuration](./config.md) documentation.

In your built application, you can access Commoners configuration values using the `commoners` object:

```js
console.log(commoners) // { name: 'My App', version: '0.0.0', target: 'desktop', ready: Promise, services: { ... } }
```

Try replacing the default `h1` and `img` tags with your custom `name` and `icon` using the `commoners` global variable!

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
const nodeServiceUrl = commoners.services.node.url
const tsNodeServiceUrl = commoners.services.tsNode.url
const pythonServiceUrl = commoners.services.python.url
```


Use the following code snippet and update the button behavior to fetch data from your services!

```js
await Promise.all(Object.entries(commoners.services).map(([name, { url }]) => fetch(url).then(response => response.text()).then(text => `${name}: ${text}`)))
```

## Building for Production
### Services
To configure your services for production, you'll have to follow language-specific instructions. 

#### JavaScript / TypeScript
JavaScript and TypeScript services are auto-bundled using [esbuild](https://esbuild.github.io). To package these for distribution and/or indicate they'll be hosted on a remote server, you'll add the following configuration:

```js
export default {
    // ...
    services: {
        node: './src/services/node.js',
        tsNode: {
            src: './src/services/node.ts',
            publish:' https://ts-node.example.com',
        }
    }
}
```

#### Python
For Python services, you'll to specify a terminal command that will bundle the service into an executable file. We recommend using `pyinstaller` for this purpose.

```js
export default {
    // ...
    services: {
        python: {
            src: './src/services/python.py',
            publish: {
                build: 'python -m PyInstaller --name python-service --onedir --clean ./src/services/python.py --distpath ./build/python-service',
                remote: 'https://python.example.com',
                local: {
                    src: 'python-service',
                    base: './build/python/python-service',
                }
            }
        }
    }
}
```

## Release Automation using GitHub Actions
Coming soon...