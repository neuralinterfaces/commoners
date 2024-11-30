import { READY } from 'commoners:env'

import '../../style.css'

const app = document.getElementById('app')!

// ---------------------- Window Buttons ----------------------

const onWindowReady = (win) => {
  win.addEventListener("message", async (ev) => {
    const { command, payload } = ev.detail;
    if (command === "pong") return console.log('Pong', payload)
    if (command === 'ping') return win.send("pong", { request: payload, response: performance.now() })
    console.log('Other Message', command, payload)
  });

  win.addEventListener("closed", async () => console.warn('Window was closed'));

  win.send("ping", performance.now())
}

const openWindow = async (type, windows) => {
  const window = windows[type].create()
  window.addEventListener("ready", () => onWindowReady(window))
  await window.open()
}


const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1)
READY.then(({ windows }) => {
  if (!windows) return app.innerHTML = '<p>Windows plugin is not available.</p>'
  if (Object.keys(windows).length === 1 && windows.main) return `<p>Cannot open windows from a secondary window.</p>`

  
  Object.entries(windows).forEach(([ name, manager ]) => {

    const button = document.createElement('button')
    button.textContent = `Open ${capitalize(name)} Window`
    button.onclick = () => openWindow(name, windows)
    app.append(button)

    // Handle existing windows
    Object.values(manager.windows).forEach(win => onWindowReady(win))
  })

})