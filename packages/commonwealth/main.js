import express from 'express'
import cors from 'cors'
import * as commonwealth from './src/index.js'
import * as object from './demo/object.js'
import { HTTPServer } from './src/http/server.js'

const app = express()
app.use(cors())
app.use(express.json()) // Support JSON-encoded bodies
app.use(express.text()) // Support text bodies

const name = 'object'

const http = new HTTPServer()

http.service.add(name, object)
// service.add(object) // Add object to load as a service

const port = 3768
const thisUrl = `http://localhost:${port}`

app.use(express.static('.')) // Serve static files from the current directory

app.get('/events', http.subscribe)
app.post('/subscribe', http.setSubscription)

app.post('/echo', (req, res) => {
    console.log('Echoed', req.body)
    res.send(req.body)
})


// Handle anything not covered by the static paths using get requests to the service
app.get('*', http.get)

// Handle all post requests with the service
app.post('*', http.post)

app.listen(port, () => console.log(`Server started at ${thisUrl}`))