import express from 'express'
import cors from 'cors'
const app = express()
app.use(cors())

app.use(express.json({
  type: () => true // Always detect as JSON
}));

const port = process.env.PORT || 3000
const host = process.env.HOST || 'localhost'

app.post('/echo', ({ body }, res) => {
  res.send(body)
})

app.listen(port, () => {
  console.log(`Server running at http://${host}:${port}`)
})