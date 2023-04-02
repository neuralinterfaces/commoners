import express from 'express'
import cors from 'cors'
import { Service } from './src/index.js'
import objectToRegister from './demo/object.js'

const app = express()
app.use(cors())
app.use(express.json())

const name = 'service'
const service = new Service()
service.register(name, objectToRegister)

const port = 3768
const thisUrl = `http://localhost:${port}`

const handleRequest = (req) => {
    const idArray = new URL(req.url, thisUrl).pathname.split('/').filter(v => v)
    const id = [name, ...idArray].join('.')
    

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

// Handle all get requests with the service
app.get('*', (req, res) => {
    const { id, args = [] } = handleRequest(req, res)
    res.send(JSON.stringify(service.getFrom(id, ...args)))
})

// Handle all post requests with the service
app.post('*', (req, res) => {
    const { id, args } = handleRequest(req)
    res.send(JSON.stringify(service.setTo(id, ...args)))
})
  

app.listen(port, () => console.log(`Server started at ${thisUrl}`))