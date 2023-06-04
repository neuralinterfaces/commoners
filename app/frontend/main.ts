const url = new URL(globalThis.commoners.services.main.url)

console.log(globalThis.commoners.services)

const ws = new WebSocket(`ws://${url.host}`)

const sidecarMessage = document.getElementById('sidecar-msg') as HTMLElement

ws.onmessage = (o) => {
  const data = JSON.parse(o.data)
  if (data.error) return console.error(data.error)

  sidecarMessage.innerText = `${data.command} - ${data.payload}`
}

let send = (o: any) => {
  ws.send(JSON.stringify(o))
}

ws.onopen = () => {
  send({ command: 'test', payload: true })
  send({ command: 'platform' })
}