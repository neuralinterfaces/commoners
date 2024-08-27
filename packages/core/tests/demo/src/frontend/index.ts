import { NAME, ICON, SERVICES, READY } from 'commoners:env'
import './style.css'

const test = Math.random().toString(36).substring(7)

READY.then(({ echo }) => {
    const echoed = echo(test)
    console.log('Echo Confirmed', test === echoed)
})

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <img src="${ICON}" class="logo" alt="My app logo" />
    <h1>${NAME}</h1>
    <div id="outputs">
    </div>
    <div class="card">
      <button type="button">Send Requests</button>
    </div>
  </div>
`

const button = document.querySelector<HTMLButtonElement>('button')!
const outputs = document.getElementById('outputs')!

const keys = Object.keys(SERVICES)
const values = Object.values(SERVICES)

if (values.length === 0) {
  button.disabled = true
  outputs.innerHTML = '<p>No services available</p>'
}

else {

  button.onclick = async () => {
    const responses = await Promise.allSettled(values.map(({ url }) => fetch(url).then(response => response.text())))
    outputs.innerHTML = responses.map((p, i) => {
      const name = keys[i]
      if (p.status === 'fulfilled')return `<p><b>${name}:</b> ${p.value}</p>`
      else return `<p style="color: red;"><b>${name}:</b> ${p.reason}</p>`
    }).join('')
  }

}