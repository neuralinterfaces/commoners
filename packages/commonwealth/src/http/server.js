import { Service } from "../Service.js";


export class HTTPServer {

    selfName = 'self'
    service = new Service()

    constructor(){
        this.service.add(this.selfName, this.service)
    }

    clients = {}

    subscribe = (req, res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders(); // flush the headers to establish SSE with client
    
        // Register for later use
        const id =  Math.random().toString(36).substr(2, 9)
        this.clients[id] = {
            endpoint: res,
            subscriptions: []
        }

        res.write(`data: ${JSON.stringify({commonersClientId: id})}\n\n`)
                
        // If client closes connection, stop sending events
        res.on('close', () => {
            this.clients[id].subscriptions.forEach((o) => this.service.unsubscribe(o.endpoint, o.subscription))
            delete this.clients[id]
            res.end();
        });
    }

    // Handle the subscription of a client to a service
    setSubscription = (req, res) => {
        const { id, args, clientId } = this.#handleRequest(req, res)

        const endpointId = args[0]
        const subId = this.service.subscribe(endpointId, (result) =>  {
            console.log(Date.now(), result)
            this.clients[clientId]?.write(`data: ${JSON.stringify({ id: endpointId, result })}\n\n`)
        })

        const info = { endpoint: endpointId, subscription: subId }
        this.clients[clientId].subscriptions.push(info)

        res.send({ id, result: info })
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
        const { id, args = [], notify = true } = this.#handleRequest(req)    
        try {
            const toSend = this.service.set(id, ...args) ?? null
            res.send({ id, result: toSend })
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