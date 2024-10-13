const messageEventName = 'message'

export function load () {
    return (message) => {
        if (commoners.DESKTOP) return this.sendSync(messageEventName, message) // Electron Echo Test
        else return message // Basic Echo Test
    }
}

export const desktop = {
    load: function () {
        this.on(messageEventName, (ev, message) => ev.returnValue = message)
    }
}