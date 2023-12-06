const test = Math.random().toString(36).substring(7)

const nameEl = document.getElementById('name')
nameEl.innerText = commoners.name

commoners.ready.then(({ echo }) => {

    const echoed = echo(test)
    console.log('Echo Confirmed', test === echoed)
    
})