import { Service } from "../Service.js"

const doNotSetSymbol = Symbol('commonwealth-http-client')

export class HTTPClient {
    constructor(url) {
       this.#url = url
    }

    #added = {}
    #url

    // Wrapper Functions for Service Calls
    // Subscribe to the server-side endpoint — or refer to a basic route if it was added by the user
    subscribe = async (id, f) => {
        if (typeof id !== 'string') throw new Error('Subscribe function must have a string as the first argument')
        else {
            if (this.#added[id]) this.service.subscribe(id, f)
            else {
                await this.#post('subscribe', id)
                return this.service.subscribe(id, f)
            }
        }
    }

    // Unsubscribe client-side from an endpoint
    unsubscribe = async (source, target) => {
        if (typeof source !== 'string') throw new Error('Unsubscribe function must have a string as the first argument')
        else this.service.unsubscribe(source, target)
    }

    // Add a basic route to the server
    add = async (route, config = {}) => {
        if (typeof route !== 'string') throw new Error('Add function must have a string as the first argument')
        else if (this.service.endpoints[route]) throw new Error('Cannot add a route that already exists on the remote service')
        this.service.add(route, (...args) => this.#post(route, ...args))
        this.#added[route] = config
    }

    // Remove a basic route from the server
    remove = async (route) => {
        if (typeof route !== 'string') throw new Error('Remove function must have a string as the first argument')
        else if (!this.#added[route]) throw new Error('Cannot remove a route that was not added on the client')
        else {
            this.service.remove(route)
            delete this.#added[route]
        }
    }

    get = async (id, ...args) => {
        const res = (await this.#get(id, ...args))
        return res?.result ?? res
    }

    set = async (id, ...args) => {
        const result = (await this.#post(id, ...args))
        const resolved = result?.result ?? result
        if (this.#added[id]) this.service.set(id, resolved)
        return resolved
    }


    // Client-specific functions

    url = () => this.#url

    connect = () => {

        if (this.source) {
            if (this.source.readyState !== 2) this.disconnect() // disconnect if not connected
            else throw new Error('Already connected')
        }

        this.service = new Service() // Create a new service
        this.source = new EventSource(`${this.#url}/events`);

        // Event Updates + Special Commands
        this.source.onmessage = (event) => {
            const json = JSON.parse(event.data)

            // Special Commands
            if (json.commonersClientId) {
                this.source.clientId = json.commonersClientId // Save client id
                return
            }

            // General Commands
            this.service.set(json.id, {
                [doNotSetSymbol]: true,
                result: json.result
            })
        };
    
        this.source.onerror = (err) => {
            console.error('[commonwealth-http-client] Error:', err)
            this.onerror()
            this.disconnect()
        }
        
        this.source.onclose = () => {
            this.onclose()
        }

        this.source.onopen = async () => {
            const { result } = await this.#get('self/list') // List the endpoints on the service

            result.forEach(endpoint => this.service.add(endpoint, (...args) =>  {
                if (args[0]?.[doNotSetSymbol]) return args[0].result // If the result is a proxy, return the result
                else return this.set(endpoint, ...args)  // Proxy the server for user-defined sets
            }))
            this.onopen()
        }
    }

    #get = async (id) => {
        return await fetch(`${this.#url}/${id.split('.').join('/')}`)
        .then(this.#handleServerResponse)
    }

    #post = async (id, ...args) => {

        return await fetch(`${this.#url}/${id.split('.').join('/')}`, {
            method: 'POST',
            ...this.#generateFetchOptions(id, args)
        })
        .then(this.#handleServerResponse)
    }

    #generateFetchOptions = (id, args) => {
        const fromAdded = this.#added[id]
        const headers = new Headers(fromAdded ? fromAdded : { 'Content-Type': 'application/json' })
        const type = headers.get('content-type')
        let base = fromAdded ? args[0] : { args, clientId: this.source.clientId } // Basic body vs Client-specific body
        const body = (type && type.includes('application/json')) ? JSON.stringify(base) : base // JSON vs Text
        return { headers, body }
    }

    #handleServerResponse = (res) => {
        if (res.ok) {
            const type = res.headers.get('content-type')
            if (type && type.includes('application/json')) return res.json()
            else return res.text()
        }
        else throw new Error(`${res.status}: ${res.statusText}`)
    }

    disconnect = () => {
        this.source.close()
        delete this.source
    }

    onopen = () => {}
    onclose = () => {}
}