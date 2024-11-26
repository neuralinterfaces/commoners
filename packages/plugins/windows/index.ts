import { BaseConfig } from '@commoners/solidarity'

type Window = {
  src: string,
} & Partial<BaseConfig>

type Windows = Record<string, Window>

const linkToMainWindow = (eventTarget) => {

  // All messages
  globalThis.addEventListener(
    "message",
    (event) => {
      if (event.origin !== globalThis.origin) return; // Must be the same origin
      const { command, payload } = event.data;
      eventTarget.dispatchEvent(new CustomEvent("message", { detail: { command, payload } }));
    },
    false,
  );

  const context = {
    send: (command, payload = {}) => globalThis.parent.postMessage({ command, payload }),
    on: (command, callback) => eventTarget.addEventListener("message", (ev) => ev.detail.command === command && callback(ev.detail.payload)),
  }

  context.on(`link`, () => context.send(`link`)) // Start linking
  const readyPromise = new Promise(resolve => context.on(`ready`, resolve))

  return {
    close: () => globalThis.close(),
    send: (command, payload) => readyPromise.then(() => context.send(command, payload)), // Send message back to the main window
    on: (command, callback) => context.on(`${command}`, callback), // Listen for message to window
  }
}

const linkToMainElectronWindow = (id, context) => {

  context.on(`link:${id}`, () => context.send(`${id}:link`)) // Start linking
  const readyPromise = new Promise(resolve => context.on(`ready:${id}`, resolve))

  return {
    close: () => context.send(`${id}:close`), // Close window
    send: (command, payload) => readyPromise.then(() => context.send(`${id}:message`, { command, payload })), // Send message back to the main window
    on: (command, callback) => context.on(`${command}:${id}`, callback), // Listen for message to window
  }
}

class ElectronWindow extends EventTarget {

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

class BrowserWindow extends EventTarget {
   
  #ref: WindowProxy | null

  config: Window

  #id = crypto.randomUUID()

  constructor(config) {
    super();
    this.config = config
  }

  open = () => {

    const { src, ...overrides } = this.config

    const { electron = {} } = overrides

    const windowConfig = Object.assign({
      status: true,
      toolbar: false,
      menubar: false,
      location: false
    }, electron.window)

    // Generate window features from Electron BrowserWindow options
    const features = Object.entries(windowConfig).reduce((acc, [key, value]) => {
      if (typeof value === 'boolean') acc.push(`${key}=${value ? 'yes' : 'no'}`)
      else if (value) acc.push(`${key}=${value}`)
      return acc
    }, []).join(",")

    const ref = globalThis.open(
      src, 
      this.#id, 
      features
    )

    if (!ref) return

    this.#ref = ref
    ref.COMMONERS_WINDOW_POPUP = true
    ref.addEventListener("load", () => {
      this.dispatchEvent(new CustomEvent("ready", { detail: ref }))

      ref.addEventListener("message", (event) => {
        this.dispatchEvent(new CustomEvent("message", { detail: event.data }))
      })

      ref.addEventListener("beforeunload", () => {
        this.#ref = null
        this.dispatchEvent(new CustomEvent("closed"))
      })
    })

    return ref
  }

  send = (command, payload) => {
    if (this.#ref) this.#ref.postMessage({ command, payload })
  }

  close = () => {
    if (this.#ref) this.#ref.close()
  }


}

export default (windows: Windows) => {

  const windowTypes = Object.keys(windows)

  const assets = windowTypes.reduce((acc, id) => {
    const info = typeof windows[id] === 'string' ? { src: windows[id] } : windows[id]
    acc[id] = info
    return acc
  }, {})

  return {
    isSupported: {
      mobile: false,
      web: true
    },
    assets,
    load({ WEB }) {

      if (WEB) {

        if (globalThis.COMMONERS_WINDOW_POPUP) {
          const eventTarget = new EventTarget()

          return {
            main: linkToMainWindow(eventTarget)
          }
        }

        const manager = windowTypes.reduce((acc, type) => {

          const windows = {}

          // Close window before unloading
          window.addEventListener('beforeunload', () => Object.values(windows).forEach(win => win.close()))
  
          acc[type] = { 
            create: () => {
              const win = new BrowserWindow(assets[type])
              win.addEventListener('ready', (ev) => windows[ev.detail] = win)
              return win
            },
            windows
          }
          return acc
        }, {})

        return manager
      }


      // ---------------------- Electron ----------------------

      const isMain = this.__main

      if (!isMain) return {
        main: linkToMainElectronWindow(this.__id, this)
      }

      const manager = windowTypes.reduce((acc, type) => {

        const windows = {}

        acc[type] = { 
          create: () => {
            const win = new ElectronWindow(type, this)
            win.addEventListener('ready', (ev) => windows[ev.detail] = win)
            return win
          },
          windows
        }
        return acc
      }, {})

      const existingWindows = this.sendSync("windows")
      Object.entries(existingWindows).forEach(( [id, type] ) => {
        const win = new ElectronWindow(type, this)
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

        // Close specific window if requested by the plugin
        this.on(`close`, (_, id) => this.WINDOWS[id]?.close()); 
        
        this.on("open", async (_, type, requestId) => {

          const { electron = {} } = windows[type]

          const win = await createWindow(assets[type], electron.window);
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

        const { __id,  __main } = win

        this.WINDOWS[__id] = win

        if (__main) {
          win.on("closed", () => Object.values(this.WINDOWS).forEach(_win => _win !== win && _win.close())); // Close all windows when the main window has closed
        }


      },
      unload: function (win) {
        delete this.WINDOWS[win.__id]
      }
    },
  };
};

  