import { backendPort } from '../common/index.js'

console.log('Port', backendPort)
const button = document.querySelector('button') as HTMLButtonElement
const messageReadout = document.querySelector('p') as HTMLParagraphElement

if (button) button.onclick = async () => {
  const message = await fetch(`http://127.0.0.1:${backendPort}`).then(res => res.text())
  messageReadout.innerHTML = message
}
