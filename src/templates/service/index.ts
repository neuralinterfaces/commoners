import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())

app.get('/', (_, res) => {
  res.send(`Hello world from ${process.env.COMMONERS_NAME}`)
})

const port = process.env.COMMONERS_PORT
app.listen(port, () => {
  console.log(`Server started at http://localhost:${port}`)
})