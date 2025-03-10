import express from 'express'
import cors from 'cors'
const app = express()
app.use(cors())

app.use(express.json({
  type: () => true // Always detect as JSON
}));

const port = process.env.PORT || 3000
const host = process.env.HOST || 'localhost'
const SECRET_VARIABLE = process.env.SECRET_VARIABLE || ''

app.post('/echo', ({ body }, res) => {
  res.send(body)
})

app.get('*', (req, res) => {
  res.send(SECRET_VARIABLE)
})

app.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}`)
})