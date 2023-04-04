import express from 'express'
import cors from 'cors'
import * as commonwealth from './src/index.js'
import * as object from './demo/object.js'
import { HTTPServer } from './src/http/server.js'

const app = express()
app.use(cors())
app.use(express.json())

const name = 'object'
const selfName = `self`

const http = new HTTPServer()

// const addEndpointName = `${selfName}.add`

// const sendToAllSubscribers = function (result) {
//     const id = this[commonwealth.symbols.id]
//     console.log('Wants to send!', id)
// }

// // // NOTE: Must subscribe after existence
// http.service.subscribe(addEndpointName, (registered) => {
//     const name = registered?.[commonwealth.symbols.id]
//     if (name.slice(0,4) !== 'self') http.service.subscribe(name, sendToAllSubscribers)
// })

http.service.add(name, object)
// service.add(object) // Add object to load as a service

const port = 3768
const thisUrl = `http://localhost:${port}`

app.use(express.static('.')) // Serve static files from the current directory

app.get('/events', http.subscribe)
app.post('/subscribe', http.setSubscription)

// Handle anything not covered by the static paths using get requests to the service
app.get('*', http.get)

// Handle all post requests with the service
app.post('*', http.post)

app.listen(port, () => console.log(`Server started at ${thisUrl}`))