import express from 'express'
import cors from 'cors'

const args = process.argv.slice(2)
const app = express()
app.use(cors())

app.get('/', (_, res) => {
  res.send('Hello world from the server')
})

app.listen(args[0], () => {
  console.log(`Server started on http://localhost:${args[0]}`)
})