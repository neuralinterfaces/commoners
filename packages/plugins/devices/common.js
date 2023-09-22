  // -----------------------------------------------------------------------------------------
// ------------------------------ COMMON BETWEEN DEVICE TYPES ------------------------------
// -----------------------------------------------------------------------------------------

export const generateModal = ({ 
  headerText = 'Available Devices', 
  mapDeviceToInfo,
  onClose, 
  added,
  removed,
}) => {

  const dialog = document.createElement('dialog')
  dialog.addEventListener('click', () => dialog.close());


  const container = document.createElement('section')
  container.addEventListener('click', (event) => event.stopPropagation());
  dialog.append(container)

  const header = document.createElement('header')
  header.style.paddingBottom = '5px'
  header.style.marginBottom = '10px'
  header.style.borderBottom = '1px solid gainsboro'

  const footer = document.createElement('footer')
  footer.style.paddingTop = '20px'

  const main = document.createElement('div')
  main.style.overflow = 'auto'
  main.style.maxHeight = '300px'
  main.style.minWidth = '500px'

  const title = document.createElement('h3')
  title.innerText = headerText
  header.append(title)

  const ul = document.createElement('ul')
  main.append(ul)

  const form = document.createElement('form')
  form.method = 'dialog'

  const cancelButton = document.createElement('button')
  cancelButton.innerText = 'Cancel'

  let selectedDevice = ''
  const pairButton = document.createElement('button')
  pairButton.innerText = 'Pair'
  pairButton.addEventListener('click', () => {
    dialog.close(selectedDevice)
  })


  form.append(cancelButton, pairButton)
  footer.append(form)

  container.append(header, main, footer)

  dialog.addEventListener('close', () => {
    onClose(dialog.returnValue ?? '')
  })

  let devices = []

  const renderList = (devices) => {
    const mapped = devices.map(mapDeviceToInfo)
    const filtered = mapped.filter(o => !dialog.querySelector(`[data-id="${o.id}"]`))
    ul.append(...filtered.map(createListItem))
  }

  // Wath for when the dialog opens
  let observer = new MutationObserver(function(ev)  {
    if (ev[0].attributeName == 'open') {
      ul.innerText = ''
      selectedDevice = ''
      pairButton.setAttribute('disabled', '')
      renderList(devices)
    }
  });

  observer.observe(dialog, { attributes: true })

  const createListItem = ({ name, info, id }) => {
    const li = document.createElement('li')
    li.style.cursor = 'pointer'
    li.innerText = info ? `${name} (${info})` : name
    li.setAttribute('data-id', id)
    li.onclick = () => {
      pairButton.removeAttribute('disabled')
      selectedDevice = id
    }
    return li
  }

  if (added) added((device) => ul.append(createListItem(mapDeviceToInfo(device))))

  if (removed) removed((device) => {
    const info = mapDeviceToInfo(device)
    const el = dialog.querySelector(`[data-id="${info.id}"]`)
    el.remove()
  })

  // For list population
  dialog.update = (update) => renderList(devices = update)

  return dialog
}
  // -----------------------------------------------------------------------------------------
  // -----------------------------------------------------------------------------------------
  // -----------------------------------------------------------------------------------------
  
  