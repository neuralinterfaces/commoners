const { READY, ICON } = commoners

// Display the icon
document.body.innerHTML = `
  <div style="display:flex; justify-content:center; align-items:center; height:100vh; width: 100vw; gap: 10px;">
    <img src="${ICON}" class="logo" alt="My logo" width="100" height="100" />
    <h1>Popup is displayed</h1>
  </div>
`



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