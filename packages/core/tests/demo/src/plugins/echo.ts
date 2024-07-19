const messageEventName = 'message'

export function load () {
    console.log(import.meta.env)
    return (message) => {
        if (commoners.DESKTOP) return this.sendSync(messageEventName, message) // Electron Echo Test
        else return message // Basic Echo Test
    }
}

export const desktop = {
    load: function () {
        this.on(messageEventName, (ev, message) => ev.returnValue = message)
        console.log(process.env.COMMONERS_SHARE_PORT, import.meta.env)
    },
    preload: () => {} // NOTE: Add a preload test later
}