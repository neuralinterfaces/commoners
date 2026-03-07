type ModalProps = {
  headerText: string
  mapDeviceToInfo: Function
  onClose: Function
  added?: Function
  removed?: Function
}

const name = 'commoners-device-modal'

export default (props: ModalProps) => {
  if (!customElements.get(name)) {
    const template = document.createElement('template')

    template.innerHTML = `
      <style>

      :host {
        --modal-bg: #ffffff;
        --modal-border: #dcdcdc;
        --modal-text: #1a1a1a;
        --modal-text-muted: #808080;
        --modal-selected-bg: #f0f0f0;
        --modal-backdrop: rgba(0, 0, 0, 0.7);
        --modal-btn-bg: #ffffff;
        --modal-btn-border: #dcdcdc;
        --modal-btn-text: #1a1a1a;
        --modal-radius: 6px;
      }

      @media (prefers-color-scheme: dark) {
        :host {
          --modal-bg: #1e1e1e;
          --modal-border: #3a3a3a;
          --modal-text: #e0e0e0;
          --modal-text-muted: #808080;
          --modal-selected-bg: #2a2a2a;
          --modal-backdrop: rgba(0, 0, 0, 0.85);
          --modal-btn-bg: #2a2a2a;
          --modal-btn-border: #3a3a3a;
          --modal-btn-text: #e0e0e0;
        }
      }

      :host([data-theme="dark"]) {
        --modal-bg: #1e1e1e;
        --modal-border: #3a3a3a;
        --modal-text: #e0e0e0;
        --modal-text-muted: #808080;
        --modal-selected-bg: #2a2a2a;
        --modal-backdrop: rgba(0, 0, 0, 0.85);
        --modal-btn-bg: #2a2a2a;
        --modal-btn-border: #3a3a3a;
        --modal-btn-text: #e0e0e0;
      }

      :host([data-theme="light"]) {
        --modal-bg: #ffffff;
        --modal-border: #dcdcdc;
        --modal-text: #1a1a1a;
        --modal-text-muted: #808080;
        --modal-selected-bg: #f0f0f0;
        --modal-backdrop: rgba(0, 0, 0, 0.7);
        --modal-btn-bg: #ffffff;
        --modal-btn-border: #dcdcdc;
        --modal-btn-text: #e0e0e0;
      }

      h3 {
        margin: 0;
      }

      dialog {
        padding: 0;
        border-radius: var(--modal-radius);
        border: 0;
        color: var(--modal-text);
      }

      dialog::backdrop {
        background: var(--modal-backdrop);
      }

      section {
        position: relative;
        display: grid;
        grid-template-rows: min-content 1fr min-content;
        overflow: hidden;
      }

      header {
        padding: 16px;
        padding-bottom: 10px;
        background: var(--modal-bg);
        border-bottom: 1px solid var(--modal-border);
        color: var(--modal-text);
      }

      footer {
        padding: 16px;
        padding-top: 10px;
        background: var(--modal-bg);
        border-top: 1px solid var(--modal-border);
        color: var(--modal-text);
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
      }

      main {
        overflow: auto;
        max-height: 300px;
        min-width: 500px;
        background: var(--modal-bg);
      }

      ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      ul:empty::after {
        content: "No devices found.";
        display: block;
        padding: 16px;
        text-align: center;
        font-weight: 300;
        color: var(--modal-text-muted);
      }

      li {
        padding: 16px;
        border-bottom: 1px solid var(--modal-border);
        color: var(--modal-text);
      }

      li:last-child {
        border-bottom: none;
      }

      li[selected] {
        background: var(--modal-selected-bg);
      }

      button {
        padding: 8px 16px;
        border: 1px solid var(--modal-btn-border);
        background: var(--modal-btn-bg);
        color: var(--modal-btn-text);
        cursor: pointer;
        border-radius: 4px;
      }

      </style>
      <dialog>
        <section>
          <header>
            <h3></h3>
          </header>
          <main>
            <ul></ul>
          </main>
          <footer>
              <button id="cancel">Cancel</button>
              <button id="pair">Pair</button>
          </footer>
        </section>
      </dialog>
    `

    class CommonersDeviceModal extends HTMLElement {
      headerText: ModalProps['headerText'] = 'Available Devices'
      mapDeviceToInfo: ModalProps['mapDeviceToInfo']
      onClose: ModalProps['onClose']
      added: ModalProps['added']
      removed: ModalProps['removed']

      constructor(props) {
        super()
        Object.assign(this, props)
      }

      devices = []

      selectedDevice = ''

      getDialog = () => {
        return this.shadowRoot.querySelector('dialog') as HTMLDialogElement
      }

      connectedCallback() {
        this.attachShadow({ mode: 'open' })

        this.shadowRoot.appendChild(template.content.cloneNode(true))

        // Sync data-theme with the document element
        const syncTheme = () => {
          const theme = document.documentElement.getAttribute('data-theme')
          if (theme) this.setAttribute('data-theme', theme)
          else this.removeAttribute('data-theme')
        }
        syncTheme()
        const themeObserver = new MutationObserver(syncTheme)
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

        const dialog = this.getDialog()
        dialog.addEventListener('click', () => dialog.close())

        const container = this.shadowRoot.querySelector('section') as HTMLElement
        container.addEventListener('click', event => event.stopPropagation())

        const title = this.shadowRoot.querySelector('h3') as HTMLElement
        title.innerText = this.headerText

        const ul = this.shadowRoot.querySelector('ul') as HTMLUListElement

        const cancelButton = this.shadowRoot.getElementById('cancel') as HTMLButtonElement
        cancelButton.addEventListener('click', () => dialog.close())

        const pairButton = this.shadowRoot.getElementById('pair') as HTMLButtonElement
        pairButton.addEventListener('click', () => dialog.close(this.selectedDevice))

        dialog.addEventListener('close', () => {
          this.onClose(dialog.returnValue ?? '')
        })

        // Wath for when the dialog opens
        const observer = new MutationObserver(ev => {
          if (ev[0].attributeName == 'open') {
            ul.innerText = ''
            this.selectedDevice = ''
            pairButton.setAttribute('disabled', '')
            this.renderList(this.devices)
          }
        })

        observer.observe(dialog, { attributes: true })

        const { added, removed } = this

        if (added) added(device => ul.append(this.createListItem(this.mapDeviceToInfo(device))))

        if (removed)
          removed(device => {
            const info = this.mapDeviceToInfo(device)
            const el = dialog.querySelector(`[data-id="${info.id}"]`) as HTMLLIElement
            el.remove()
          })
      }

      createListItem = ({ name, info, id }) => {
        const li = document.createElement('li')
        li.style.cursor = 'pointer'
        li.innerText = info ? `${name} (${info})` : name
        li.setAttribute('data-id', id)
        li.onclick = () => this.onItemClicked(id)
        return li
      }

      onItemClicked = id => {
        const pairButton = this.shadowRoot.getElementById('pair') as HTMLButtonElement
        pairButton.removeAttribute('disabled')
        this.selectedDevice = id

        const allItems = this.shadowRoot.querySelectorAll('li') as NodeListOf<HTMLLIElement>
        allItems.forEach(item => {
          if (item.getAttribute('data-id') === id) item.setAttribute('selected', '')
          else item.removeAttribute('selected')
        })
      }

      renderList = devices => {
        const dialog = this.getDialog()
        const ul = this.shadowRoot?.querySelector('ul') as HTMLUListElement
        const mapped = devices.map(this.mapDeviceToInfo)
        const filtered = mapped.filter(o => !dialog.querySelector(`[data-id="${o.id}"]`))
        ul.append(...filtered.map(this.createListItem))
      }

      showModal = () => this.getDialog().showModal()

      close = () => this.getDialog().close()

      update = update => {
        this.renderList((this.devices = update))
      }
    }

    window.customElements.define(name, CommonersDeviceModal)
  }

  const modal = document.createElement(name)
  Object.assign(modal, props)

  return modal
}
