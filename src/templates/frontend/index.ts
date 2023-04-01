
const services = (globalThis as any).COMMONERS_SERVICES = {
  first: {
    port: 3769
  },
  second: {
    port: 3770
  }
}


const buttonContainer = document.querySelector('#buttons') as HTMLDivElement
const messageReadout = document.querySelector('p') as HTMLParagraphElement

const createButton = (name: any, config: {
  port: number
}) => {

  const button = document.createElement('button')
  button.innerHTML = `Connect to ${name} service`
  buttonContainer.appendChild(button)

  button.onclick = async () => {
    const message = await fetch(`http://127.0.0.1:${config.port}`).then(res => res.text())
    messageReadout.innerHTML = message
  }
}


Object.entries(services).forEach(([name, service]) => {
  createButton(name, service)
})

  