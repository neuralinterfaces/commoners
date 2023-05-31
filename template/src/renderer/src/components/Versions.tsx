import { type Component, createSignal } from 'solid-js'

const Versions: Component = () => {
  if (window.electron) {
    const [versions] = createSignal(window.electron.process.versions)

    return (
      <ul class="versions">
        <li class="electron-version">Electron v{versions().electron}</li>
        <li class="chrome-version">Chromium v{versions().chrome}</li>
        <li class="node-version">Node v{versions().node}</li>
        <li class="v8-version">V8 v{versions().v8}</li>
      </ul>
    )
  } 
  
  else return <small>No version details available for web build</small>
}

export default Versions
