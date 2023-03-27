import express from 'express'
import cors from 'cors'

const args = process.argv.slice(2)
const app = express()
app.use(cors())

app.get('/', (_, res) => {
  res.send('Hello world from the server')
})

console.log(args)
app.listen(args[0], () => {
  console.log(`App listening on port ${args[0]}`)
})