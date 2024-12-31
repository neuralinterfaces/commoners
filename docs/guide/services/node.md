
# Example Node Service
This is an example HTTP server written in TypeScript.

```ts
import http from 'node:http';

const host = process.env.HOST || ''
const port = process.env.PORT || 8000

const server = http.createServer((
    req: http.IncomingMessage,
    res: http.ServerResponse
) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Echo Request
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => body += chunk.toString());
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': req.headers['content-type'] });
      res.end(body);
    });
    return;
  }

  // Default Response
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello World\n');
  return;
});

server.listen(port, host, () => console.log(`Server running at http://${host}:${port}/`));
```