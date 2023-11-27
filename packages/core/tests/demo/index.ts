const test = Math.random().toString(36).substring(7)

commoners.ready.then(({ echo }) => {

    const echoed = echo(test)
    console.log('Echo Confirmed', test === echoed)
    
})