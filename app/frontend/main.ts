import { invoke } from "@tauri-apps/api/tauri";

let greetInputEl: HTMLInputElement | null;
let greetMsgEl: HTMLElement | null;

async function greet() {
  if (greetMsgEl && greetInputEl) {
    // Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
    greetMsgEl.textContent = await invoke("greet", {
      name: greetInputEl.value,
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  greetInputEl = document.querySelector("#greet-input");
  greetMsgEl = document.querySelector("#greet-msg");
  document.querySelector("#greet-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    greet();
  });
});

const ws = new WebSocket('ws://localhost:3768')

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