const { READY } = commoners

READY.then(({ localServices }) => {

    if (!localServices) return document.body.innerHTML = '<p>Local services are not available</p>'


    const addListItem = async (info) => {
        const { name, url } = info
        const li = document.createElement('li')
        li.id = url
        const header = document.createElement('div')
        header.innerHTML = `<b>${name}</b><small>${url}</small>`

        const response = document.createElement('div')
        response.innerHTML = 'Waiting for response...'

        li.append(header, response)
        ul.append(li)

        await fetch(url).then(response => response.text())
        .then(text => response.innerHTML = text)
        .catch(e => {
            response.innerHTML = e.message
            response.style.color = 'red'
        })
    }

    localServices.onServiceUp(addListItem)

    localServices.onServiceDown((service) => {
        const { url } = service
        const li = document.getElementById(url)
        if (li) li.remove()
    })

    const ul = document.querySelector<HTMLUListElement>('ul')!
    ul.innerHTML = ''
    localServices.getServices().then(services => Object.entries(services).map(([ _, info ]) => addListItem(info)))
})
