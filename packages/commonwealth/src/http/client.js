import { Service } from "../Service.js"

const doNotSetSymbol = Symbol('commonwealth-http-client')

export class HTTPClient {
    constructor(url) {
       this.url = url
    }

    // Shell Functions for Service Calls
    subscribe = async (id, f) => {
        if (typeof id !== 'string') throw new Error('Subscribe function must have a string as the first argument')
        else {
            const res = await this.#post('subscribe', id)
            return this.service.subscribe(id, f)
        }
    }

    // NO ADD CALL
    // NO REMOVE CALL
    get = async (id, ...args) => (await this.#get(id, ...args))?.result
    set = async (id, ...args) => (await this.#post(id, ...args))?.result


    // Client-specific functions
    connect = (url) => {

        if (this.source) {
            if (this.source.readyState !== 2) this.disconnect() // disconnect if not connected
            else throw new Error('Already connected')
        }

        if (url) this.url = url

        this.service = new Service() // Create a new service
        this.source = new EventSource(`${this.url}/events`);

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
        return await fetch(`${this.url}/${id.split('.').join('/')}`)
        .then(this.#handleServerResponse)
    }

    #post = async (id, ...args) => {
        return await fetch(`${this.url}/${id.split('.').join('/')}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ args, clientId: this.source.clientId })
        })
        .then(this.#handleServerResponse)
    }

    #handleServerResponse = (res) => {
        if (res.ok) return res.json()
        else throw new Error(`${res.status}: ${res.statusText}`)
    }

    disconnect = () => {
        this.source.close()
        delete this.source
    }

    onopen = () => {}
    onclose = () => {}
}