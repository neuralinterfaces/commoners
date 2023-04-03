import { Service } from "../Service.js";


export class HTTPServer {

    selfName = 'self'
    service = new Service()

    constructor(){
        this.service.add(this.selfName, this.service) // REGISTER WITHOUT STUFF
    }

    clients = {}

    subscribe = (req, res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders(); // flush the headers to establish SSE with client
    
        // Register for later use
        this.clients[req.query.id] = res
    
        // If client closes connection, stop sending events
        res.on('close', () => {
            delete this.clients[req.query.id]
            res.end();
        });
    }

    get = (req, res) => {
        const { id, args = [] } = this.#handleRequest(req, res)
        try {
            const toSend = this.service.get(id, ...args)
            res.send({ id, result: toSend }) // Send null if no response is found
        } catch (e) {
            res.status(404).send({ id, error: e.message })
        }
    }

    post = (req, res) => {
        const { id, args = [] } = this.#handleRequest(req)    
        try {
            const toSend = this.service.set(id, ...args) ?? null
            res.send({ id, result: toSend }) // Send null if no response is found
        } catch (e) {
            res.status(404).send({ id, error: e.message })
        }
    }
        

    #handleRequest = (req) => {

        const idArray = req.url.split('/').filter(v => v)
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
}