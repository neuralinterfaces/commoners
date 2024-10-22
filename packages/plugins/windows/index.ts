import { BaseConfig } from '@commoners/solidarity'

type Window = {
  src: string,
  window?: Electron.BrowserWindowConstructorOptions
  overrides?: BaseConfig
}

type Windows = Record<string, Window>

const linkToMainWindow = (id, context) => {

  context.on(`link:${id}`, () => context.send(`${id}:link`)) // Start linking
  const readyPromise = new Promise(resolve => context.on(`ready:${id}`, resolve))

  return {
    close: () => context.send(`${id}:close`), // Close window
    send: (command, payload) => readyPromise.then(() => context.send(`${id}:message`, { command, payload })), // Send message back to the main window
    on: (command, callback) => context.on(`${command}:${id}`, callback), // Listen for message to window
  }
}

class BrowserWindow extends EventTarget {

  id: string | null
  type: string
  context: any
  
  constructor(type, context) {
    super();
    this.type = type
    this.context = context
    // globalThis.addEventListener("beforeunload", () => this.close());
  }

  send = (command, payload) => {
    if (!this.id) return
    return this.context.send(`message:${this.id}`, { command, payload });
  }

  #onId = (id) => {
    if (!id) return
    this.id = id

    this.dispatchEvent(new CustomEvent("ready", { detail: id }))

    this.context.on(`${id}:message`, (_evt, value) =>
      this.dispatchEvent(new CustomEvent("message", { detail: value }))
    );

    this.context.on(`${id}:error`, (_evt, value) => {
        this.dispatchEvent(new ErrorEvent("error", { error: value }));
    });

    this.context.once(`${id}:closed`, (_, value) => {
      this.id = null
      this.dispatchEvent(new CustomEvent("closed", { detail: value }))
    });

    return id
  }

  connect = (id) => {
    const exists = this.context.sendSync("exists", id)
    if (exists) this.#onId(id)
    else console.error(`No window with ID ${id} is avaialable`)
    return exists
  }

  open = async () => {

    if (this.id) return this.id

    return new Promise((resolve) => {
      const requestId = crypto.randomUUID()
      this.context.once(`${requestId}:ready`, (_, id) => resolve(this.#onId(id)));
      this.context.send("open", this.type, requestId)
    });
  };

  close = () => {
    if (!this.id) return
    this.context.send("close", this.id)
  };
}

export default (windows: Windows) => {

  const windowTypes = Object.keys(windows)

  const assets = windowTypes.reduce((acc, id) => {
    const info = typeof windows[id] === 'string' ? { src: windows[id] } : windows[id]
    const { src, overrides } = info
    acc[id] = { src, overrides }
    return acc
  }, {})

  return {
    isSupported: {
      mobile: false,
      web: false,
    },
    assets,
    load() {
      const isMain = this.__main
      if (!isMain) return linkToMainWindow(this.__id, this)

      const manager = windowTypes.reduce((acc, type) => {
        acc[type] = { 
          create: () => new BrowserWindow(type, this),
          windows: {}
        }
        return acc
      }, {})

      const existingWindows = this.sendSync("windows")
      Object.entries(existingWindows).forEach(( [id, type] ) => {
        const win = new BrowserWindow(type, this)
        const exists = win.connect(id)
        if (exists) manager[type].windows[id] = win
      })

      return manager
      
    },
    desktop: {
      ready: function () {
        const { createWindow } = this
        const { assets } = this.plugin;

        this.WINDOWS = {}

        this.on("windows", (ev) => {
          ev.returnValue = Object.entries(this.WINDOWS).reduce((acc, [ id, win ]) => {
            const type = this.getAttribute(win, "type")
            if (type) acc[id] = type // Only provide windows spawned with this plugin
            return acc
          }, {})
        })

        this.on("exists", (ev, id) => ev.returnValue = !!this.WINDOWS[id])

        // Close all windows when the main window has closed
        this.on(`close`, (_, id) => this.WINDOWS[id]?.close());

        this.on("open", async (_, type, requestId) => {

          // Create the Window
          const windowTypeInfo = windows[type].window
          const win = await createWindow(assets[type], windowTypeInfo);
          this.setAttribute(win, "type", type) // Assign type attribute to window
          const id = win.__id

          this.on(`${id}:message`, (_, value) => this.send(`${id}:message`, value), win); // Send from ID
          this.on(`message:${id}`, (_, value) => this.send(`message:${id}`, value), win); // Send to ID

          // Handle link request from ID
          this.on(`${id}:link`, () => {
            this.send(`ready:${id}`); // Always send ready to dependent windows
            this.send(`${requestId}:ready`, id); // Send ready to main window
          }, win);

          this.on(`${id}:close`, () => win.close(), win); // Trigger window closure
          win.on("closed", () => this.send(`${id}:closed`)); // Listen for window closure

          this.send(`link:${id}`) // Request link to ID
        });

      },

      load: function (win) {
        this.WINDOWS[win.__id] = win
      },
      unload: function (win) {
        delete this.WINDOWS[win.__id]
      }
    },
  };
};

  