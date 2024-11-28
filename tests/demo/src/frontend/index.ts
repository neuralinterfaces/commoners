const { NAME, ICON } = commoners
const name = document.getElementById('name') as HTMLElement
name.textContent = NAME

const icon = document.getElementById('icon') as HTMLImageElement
icon.src = ICON