import { createServer } from 'node:http'

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ origin: req.headers.origin ?? null }))
}).listen(process.env.PORT, process.env.HOST)
