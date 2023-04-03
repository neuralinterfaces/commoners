import express from 'express'
import cors from 'cors'
import * as commonwealth from './src/index.js'
import * as object from './demo/object.js'

const app = express()
app.use(cors())
app.use(express.json())

const name = 'object'
const service = new commonwealth.Service()

let sseEndpoints = {}
const selfName = `self`
const addEndpointName = `${selfName}.add`
service.add(selfName, service) // Add self

const sendToAllSubscribers = function (results) {
    const id = this[commonwealth.symbols.id]
    for (let sseId in sseEndpoints) {
        sseEndpoints[sseId].write(`data: ${JSON.stringify({id, results})}\n\n`); // res.write() instead of res.send()
    }
}

// NOTE: Must subscribe after existence
service.subscribe(addEndpointName, (registered) => {
    const name = registered?.[commonwealth.symbols.id]
    if (name.slice(0,4) !== 'self') service.subscribe(name, sendToAllSubscribers)
})


service.add(name, object) // Add object to load as a service

const port = 3768
const thisUrl = `http://localhost:${port}`

const handleRequest = (req) => {
    const idArray = new URL(req.url, thisUrl).pathname.split('/').filter(v => v)
    // const id = [name, ...idArray].join('.')
    const id = idArray.join('.')


    // Get requests have their information in the query string
    if (req.route.methods.get) {
        const urlParams = new URLSearchParams(req.query)
        const args = Array.from(urlParams.values())
        return {
            id,
            args,
        }
    } 
    
    // Post requests have their information in the body (json)
    else {
        return {
            ...req.body,
            id
        }
    }
}

app.use(express.static('.')) // Serve static files from the current directory

app.get('/subscribe', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // flush the headers to establish SSE with client

    // Register for later use
    sseEndpoints[req.query.id] = res
    
    // If client closes connection, stop sending events
    res.on('close', () => {
        delete sseEndpoints[req.query.id]
        res.end();
    });
})

// Handle anything not covered by the static paths using get requests to the service
app.get('*', (req, res) => {
    const { id, args = [] } = handleRequest(req, res)
    try {
        const toSend = service.get(id, ...args)
        res.send({ id, result: toSend }) // Send null if no response is found
    } catch (e) {
        res.status(404).send({ id, error: e.message })
    }
})

// Handle all post requests with the service
app.post('*', (req, res) => {

    const { id, args = [] } = handleRequest(req)
    try {
        const toSend = service.set(id, ...args) ?? null
        res.send({ id, result: toSend }) // Send null if no response is found
    } catch (e) {
        res.status(404).send({ id, error: e.message })
    }
})
  

app.listen(port, () => console.log(`Server started at ${thisUrl}`))