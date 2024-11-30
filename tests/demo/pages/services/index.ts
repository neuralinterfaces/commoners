const { SERVICES } = commoners


const keys = Object.keys(SERVICES)
const values = Object.values(SERVICES)

if (Object.keys(SERVICES).length === 0) document.body.innerHTML = '<p>No services available</p>'

else {

    const ul = document.querySelector<HTMLUListElement>('ul')!
    ul.innerHTML = ''

    Object.entries(SERVICES).map(async ([ name, { url } ]) => {
        const li = document.createElement('li')
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
    })

}