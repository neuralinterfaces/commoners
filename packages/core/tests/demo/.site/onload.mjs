// packages/core/dist/templates/utils.ts
var asyncFilter = async (arr, predicate) => Promise.all(arr.map(predicate)).then((results) => arr.filter((_v, index) => results[index]));
var pluginErrorMessage = (name, type, e) => console.error(`[commoners] ${name} plugin (${type}) failed to execute:`, e);
var removablePluginProperties = ["load"];
var sanitizePluginProperties = (plugin, target2) => {
  const copy = { ...plugin };
  const assumeRemoval = "desktop" in copy && target2 !== "desktop";
  if (assumeRemoval)
    delete copy.desktop;
  const willRemove = (v) => assumeRemoval ? !v : v === false;
  const isSupported = copy.isSupported?.[target2] ?? copy.isSupported;
  if (isSupported && typeof isSupported === "object") {
    removablePluginProperties.forEach((prop) => {
      if (willRemove(isSupported[prop]))
        delete copy[prop];
    });
  }
  return copy;
};

// packages/core/dist/templates/onload.ts
var TEMP_COMMONERS = globalThis.__commoners ?? {};
var { __plugins, target, __ready } = commoners;
delete commoners.__plugins;
if (__plugins) {
  const loaded = {};
  asyncFilter(Object.entries(__plugins), async ([id, plugin]) => {
    try {
      let { isSupported } = plugin;
      if (isSupported && typeof isSupported === "object")
        isSupported = isSupported[target];
      if (typeof isSupported?.check === "function")
        isSupported = isSupported.check;
      return typeof isSupported === "function" ? await isSupported.call(plugin, target) : isSupported !== false;
    } catch {
      return false;
    }
  }).then((supported) => {
    const sanitized = supported.map(([id, o]) => {
      const { load } = sanitizePluginProperties(o, target);
      return { id, load };
    });
    sanitized.forEach(({ id, load }) => {
      loaded[id] = void 0;
      try {
        if (load) {
          loaded[id] = commoners.target === "desktop" ? load.call({
            quit: TEMP_COMMONERS.quit,
            send: (channel, ...args) => TEMP_COMMONERS.send(`plugins:${id}:${channel}`, ...args),
            sendSync: (channel, ...args) => TEMP_COMMONERS.sendSync(`plugins:${id}:${channel}`, ...args),
            on: (channel, listener) => TEMP_COMMONERS.on(`plugins:${id}:${channel}`, listener),
            removeAllListeners: (channel) => TEMP_COMMONERS.removeAllListeners(`plugins:${id}:${channel}`)
          }) : load({});
        }
      } catch (e) {
        pluginErrorMessage(id, "load", e);
      }
    });
    commoners.plugins = loaded;
    __ready(loaded);
  });
} else
  __ready({});
