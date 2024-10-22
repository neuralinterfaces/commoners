const { READY } = commoners

READY.then(async ({ windows }) => {

    // NOTE: What did this used to do?
    // link.on("closed", () => {
    //     console.log('Closing!')
    // });
    
    windows.on("message", (_, data) => {
      const { command, payload } = data;
      if (command === "pong") return console.log('Pong', payload)
      if (command === 'ping') return link.send("pong", { request: payload, response: performance.now() })
    });

    windows.send('ping', performance.now())
})