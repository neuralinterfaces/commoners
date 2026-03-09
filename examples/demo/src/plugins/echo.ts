const messageEventName = 'message'

export function load() {
  return message => {
    if (commoners.DESKTOP)
      return this.invoke(messageEventName, message) // Electron Echo Test (async IPC)
    else return message // Basic Echo Test
  }
}

export const desktop = {
  load: function () {
    this.handle(messageEventName, (ev, message) => message)
  },
}
