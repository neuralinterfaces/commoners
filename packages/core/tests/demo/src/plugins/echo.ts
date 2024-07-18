const messageEventName = 'message'

export function load () {
    return (message) => {
        if (commoners.TARGET === 'desktop') return this.sendSync(messageEventName, message) // Electron Echo Test
        else return message // Basic Echo Test
    }
}

export const desktop = {
    load: function () {
        this.on(messageEventName, (ev, message) => ev.returnValue = message)
    },
    preload: () => {} // NOTE: Add a preload test later
}