
const echoEventName = 'echo'

import { resolve } from 'node:path'
import { fileURLToPath } from "node:url";


let src: string | null = null
try { src = resolve(fileURLToPath(import.meta.url)) } catch {}


export function load ({ DESKTOP, ENV }) {
    const originalEnv = structuredClone(ENV)
    return {
        env: originalEnv,
        echo: (message) => {
            if (DESKTOP) return this.sendSync(echoEventName, message) // Electron Echo Test
            else return message // Basic Echo Test
        },
        src
    }
}

export const desktop = {
    load: function () {
        this.on(echoEventName, (ev, message) => ev.returnValue = message)
    }
}