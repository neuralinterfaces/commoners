export function load () {
    return (message) => {
        if (commoners.target === 'desktop') return this.sendSync('echo', message) // Electron Echo Test
        else return message // Basic Echo Test
    }
}

export const desktop = {
    load: function () {
        this.on('get', (ev, message) => ev.returnValue = message)
    },
    preload: () => {} // NOTE: Add a preload test later
}