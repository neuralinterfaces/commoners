const { loadConfigFromFile, startServices } = require('@commoners/solidarity')

loadConfigFromFile(__dirname).then(async config => {
    
    const { services, close } = await startServices(config)
    
    await new Promise(resolve => setTimeout(resolve, 2000)) // Wait for services to start

    const settled = await Promise.allSettled(Object.values(services).map(({ url }) => fetch(url).then(res => res.text())))
    const resolved = settled.filter(({ status }) => status === 'fulfilled').map(({ value }) => value)
    const rejected = settled.filter(({ status }) => status === 'rejected').map(({ reason }) => reason)

    if (rejected.length) console.log(`${rejected.length} services could not be reached:`)
    else console.log(`All ${resolved.length} services are running.`)

    close()
})
