import { Service } from "../Service.js"


export class HTTPClient {
    constructor(url) {
       this.url = url
       this.service = new Service()
    }

    connect = (url) => {

        if (this.source) {
            if (this.source.readyState !== 2) this.disconnect() // disconnect if not connected
            else throw new Error('Already connected')
        }

        if (url) this.url = url

        this.source = new EventSource(`${this.url}/subscribe`);

        this.source.onmessage = (event) => {
            const json = JSON.parse(event.data)
            this.onmessage(json)
        };
    
        this.source.onerror = (err) => {
            this.onerror(err)
            evtSource.close()
        }
        
        this.source.onclose = () => {
            this.onclose()
        }

        this.source.onopen = async () => {
            this.onopen()

            const { result } = await this.post('self/list')
            result.forEach(endpoint => {
                this.service.add(endpoint, (...args) => this.post(endpoint, ...args)) // Proxy the server
            })
        }
    }

    get = async (id) => {
        return await fetch(`${this.url}/${id.split('.').join('/')}`)
        .then(res => res.json())
        .catch(e => {})
    }

    post = async (id, ...args) => {
        return await fetch(`${this.url}/${id.split('.').join('/')}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ args })
        })
        .then(res => res.json())
        .catch(e => {})
    }

    disconnect = () => {
        this.source.close()
        delete this.source
    }

    onopen = () => {}
    onclose = () => {}
    onerror = () => {}
}