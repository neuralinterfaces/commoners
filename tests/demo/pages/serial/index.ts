import * as api from "./api"

const { READY } = commoners

const connectButton = document.getElementById('connect')! as HTMLButtonElement

// ---------------------- Serial Button ----------------------
READY.then((PLUGINS) => {
  const hasPlugin = "serial" in PLUGINS
  if (!hasPlugin) return connectButton.disabled = true
connectButton.onclick = () => {
    api.connect()
  }
})