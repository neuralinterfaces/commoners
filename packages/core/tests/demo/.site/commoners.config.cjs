var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// packages/core/tests/demo/commoners.config.ts
var commoners_config_exports = {};
__export(commoners_config_exports, {
  default: () => commoners_config_default,
  name: () => name
});
module.exports = __toCommonJS(commoners_config_exports);

// packages/core/tests/demo/plugins/echo.ts
var echo_exports = {};
__export(echo_exports, {
  desktop: () => desktop,
  load: () => load
});
function load() {
  return (message) => {
    if (commoners.target === "desktop")
      return this.sendSync("echo", message);
    else
      return message;
  };
}
var desktop = {
  load: function() {
    this.on("get", (ev, message) => ev.returnValue = message);
  },
  preload: () => {
  }
  // NOTE: Add a preload test later
};

// packages/core/tests/demo/commoners.config.ts
var name = "Test App";
var basePort = 5555;
var config = {
  name,
  electron: {
    splash: "./splash.html"
  },
  plugins: { echo: echo_exports },
  services: {
    http: { src: "./services/http/index.js" }
    // ws: { src: './services/ws/index.js' }
    // python: {
    //     description: 'A simple Python server',
    //     src: './src/services/python/main.py',
    //     publish: {
    //         build: 'python -m PyInstaller --name flask --onedir --clean ./src/services/python/main.py --distpath ./build/python',
    //         local: {
    //             src: 'flask',
    //             base: './build/python/flask', // Will be copied
    //         }
    //     }
    // },
  }
};
Object.values(config.services).forEach((o, i) => o.port = basePort + i);
var commoners_config_default = config;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  name
});
