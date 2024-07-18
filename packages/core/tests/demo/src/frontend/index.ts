const test = Math.random().toString(36).substring(7)

const { NAME, READY } = commoners

const nameEl = document.getElementById('name')
nameEl.innerText = NAME

READY.then(({ echo }) => {
    const echoed = echo(test)
    console.log('Echo Confirmed', test === echoed)
    
})