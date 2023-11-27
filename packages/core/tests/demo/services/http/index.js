import { readFileSync } from 'node:fs';

import { createServer as createHTTPSServer } from 'node:https';
import { createServer as createHTTPServer } from 'node:http';

const cfg = {
  ssl: false,
  port: process.env.PORT || 8080,
  ssl_key: './ssl.key',
  ssl_cert: './ssl.crt'
};

const host = process.env.HOST || 'localhost'

function getBody(request) {
  return new Promise((resolve) => {
    const bodyParts = [];
    let body;
    request.on('data', (chunk) => {
      bodyParts.push(chunk);
    }).on('end', () => {
      body = Buffer.concat(bodyParts).toString();
      resolve(body)
    });
  });
}

const server = cfg.ssl ? createHTTPSServer({
  cert: readFileSync('/path/to/cert.pem'),
  key: readFileSync('/path/to/key.pem')
}) : createHTTPServer(async function (req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*'); /* @dev First, read about security */
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
    res.setHeader('Access-Control-Max-Age', 2592000); // 30 days
    res.setHeader('Content-type', 'text/json');
    getBody(req).then(result => {
      res.end(JSON.stringify(JSON.parse(result)))
    })
})

server.listen(cfg.port)

console.log(`Server running at http://${host}:${cfg.port}/`)
