import express from 'express'
import cors from 'cors'
import * as object from './demo/object.js'
import { HTTPServer } from './src/http/server.js'

const port = 3768 // Specify the app port

// --------------- Setup Express + Middleware ---------------
const app = express() // Create the Express app
app.use(cors()) // Allow CORS
app.use(express.json()) // Support JSON-encoded bodies
app.use(express.text()) // Support text bodies
app.use(express.static('.')) // Serve static files from the current directory

// --------------- Create your Service ---------------
const http = new HTTPServer() // Create an HTTP Server Service
http.service.add('object', object) // Mirror the client endpoint

// --------------- SSE Handlers ---------------
app.get('/events', http.subscribe) // Ensure SSE initialization is handled
app.post('/subscribe', http.setSubscription) // Ensure subscriptions are handled

// --------------- Non-Service Handlers ---------------
app.post('/echo', (req, res) => res.send(req.body)) // Specify a route not handled by the service

// --------------- Generic Service Handlers ---------------
app.get('*', http.get) // Handle anything not covered by the static paths using get requests to the service
app.post('*', http.post) // Handle all post requests with the service

// --------------- Run the Server ---------------
app.listen(port, () => console.log(`Server started at http://localhost:${port}`))