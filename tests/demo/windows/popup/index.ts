const { READY } = commoners

READY.then(async ({ windows }) => {

    const mainLink = windows.main

    mainLink.on("closed", () => {
        console.log('Closing!')
    });
    
    mainLink.on("message", (_, data) => {
      const { command, payload } = data;
      if (command === "pong") return console.log('Pong', payload)
      if (command === 'ping') return mainLink.send("pong", { request: payload, response: performance.now() })
    });

    mainLink.send('ping', performance.now())
})