const { NAME, ICON, DEV, PROD } = commoners
const name = document.getElementById('name') as HTMLElement
name.textContent = NAME

const icon = document.getElementById('icon') as HTMLImageElement
console.log('Set ICON', ICON, performance.now())
icon.src = ICON

const mode = document.getElementById('commoners-mode') as HTMLElement
mode.textContent = DEV ? 'Development' : PROD ? 'Production' : 'Unknown'