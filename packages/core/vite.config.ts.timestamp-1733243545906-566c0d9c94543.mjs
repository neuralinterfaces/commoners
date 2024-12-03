// vite.config.ts
import { defineConfig } from "file:///Users/garrettflynn/Documents/GitHub/commoners/node_modules/.pnpm/vite@5.4.9_@types+node@20.16.14_terser@5.36.0/node_modules/vite/dist/node/index.js";
import url from "node:url";
import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { exec } from "child_process";

// utils/config.js
var builtIns = [
  "node:child_process",
  "node:fs",
  "node:url",
  "node:path",
  "node:net",
  "node:util",
  "node:os",
  "node:http",
  "node:https",
  "node:module",
  "node:crypto"
];
var nodeBuiltIns = [...builtIns, ...builtIns.map((b) => b.replace("node:", ""))];

// vite.config.ts
import { normalizePath } from "file:///Users/garrettflynn/Documents/GitHub/commoners/node_modules/.pnpm/vite@5.4.9_@types+node@20.16.14_terser@5.36.0/node_modules/vite/dist/node/index.js";
import { viteStaticCopy } from "file:///Users/garrettflynn/Documents/GitHub/commoners/node_modules/.pnpm/vite-plugin-static-copy@1.0.6_vite@5.4.9_@types+node@20.16.14_terser@5.36.0_/node_modules/vite-plugin-static-copy/dist/index.js";
import chalk from "file:///Users/garrettflynn/Documents/GitHub/commoners/node_modules/.pnpm/chalk@5.3.0/node_modules/chalk/source/index.js";
var __vite_injected_original_import_meta_url = "file:///Users/garrettflynn/Documents/GitHub/commoners/packages/core/vite.config.ts";
var __dirname = url.fileURLToPath(new URL(".", __vite_injected_original_import_meta_url));
var pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json")).toString());
var toCopy = [
  join("assets")
];
var dts = {
  name: "dts-generator",
  buildEnd: (error) => {
    if (!error) {
      return new Promise((res, rej) => {
        exec(`tsc --emitDeclarationOnly --outDir ./dist/types`, {
          cwd: __dirname
        }, async (err, stdout, stderr) => {
          console.warn((await chalk).yellow(stdout));
          res();
        });
      });
    }
  }
};
var vite_config_default = defineConfig({
  plugins: [
    dts,
    viteStaticCopy({
      targets: [
        {
          src: normalizePath(resolve(__dirname, "package.json")),
          dest: "./"
        },
        // NOTE: All of these are required for now to resolve template builds
        ...toCopy.map((path) => {
          return {
            src: normalizePath(resolve(__dirname, path)) + "/[!.]*",
            dest: join(path)
          };
        })
      ]
    })
  ],
  build: {
    emptyOutDir: false,
    target: "node16",
    lib: {
      entry: {
        main: resolve(__dirname, "index"),
        services: resolve(__dirname, "services/index"),
        config: resolve(__dirname, "config")
      },
      name: "solidarity",
      formats: ["es", "cjs"],
      fileName: (format, entryName) => `${entryName}.${format === "es" ? "mjs" : "cjs"}`
    },
    rollupOptions: {
      // output: {
      //   preserveModules: true,
      // },
      external: Array.from(/* @__PURE__ */ new Set([
        // Ensure self is handled externally
        "@commoners/solidarity",
        // User-defined external packages
        ...Object.keys(pkg.dependencies),
        ...nodeBuiltIns
      ]))
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiLCAidXRpbHMvY29uZmlnLmpzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL1VzZXJzL2dhcnJldHRmbHlubi9Eb2N1bWVudHMvR2l0SHViL2NvbW1vbmVycy9wYWNrYWdlcy9jb3JlXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvVXNlcnMvZ2FycmV0dGZseW5uL0RvY3VtZW50cy9HaXRIdWIvY29tbW9uZXJzL3BhY2thZ2VzL2NvcmUvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL2dhcnJldHRmbHlubi9Eb2N1bWVudHMvR2l0SHViL2NvbW1vbmVycy9wYWNrYWdlcy9jb3JlL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcblxuaW1wb3J0IHVybCBmcm9tIFwibm9kZTp1cmxcIjtcbmltcG9ydCB7IGpvaW4sIHJlc29sdmUgfSBmcm9tIFwibm9kZTpwYXRoXCI7XG5pbXBvcnQgeyByZWFkRmlsZVN5bmMgfSBmcm9tIFwibm9kZTpmc1wiO1xuXG5pbXBvcnQgeyB0eXBlIFBsdWdpbiB9IGZyb20gJ3ZpdGUnO1xuaW1wb3J0IHsgZXhlYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgbm9kZUJ1aWx0SW5zIH0gZnJvbSBcIi4vdXRpbHMvY29uZmlnXCI7XG5cbmltcG9ydCB7IG5vcm1hbGl6ZVBhdGggfSBmcm9tIFwidml0ZVwiO1xuaW1wb3J0IHsgdml0ZVN0YXRpY0NvcHkgfSBmcm9tICd2aXRlLXBsdWdpbi1zdGF0aWMtY29weSdcblxuaW1wb3J0IGNoYWxrIGZyb20gJ2NoYWxrJ1xuXG5jb25zdCBfX2Rpcm5hbWUgPSB1cmwuZmlsZVVSTFRvUGF0aChuZXcgVVJMKCcuJywgaW1wb3J0Lm1ldGEudXJsKSk7XG5cbmNvbnN0IHBrZyA9IEpTT04ucGFyc2UocmVhZEZpbGVTeW5jKHJlc29sdmUoX19kaXJuYW1lLCAncGFja2FnZS5qc29uJykpLnRvU3RyaW5nKCkpXG5cbmNvbnN0IHRvQ29weSA9IFtcbiAgam9pbignYXNzZXRzJyksXG5dXG5cbmNvbnN0IGR0czogUGx1Z2luID0ge1xuICBuYW1lOiAnZHRzLWdlbmVyYXRvcicsXG4gIGJ1aWxkRW5kOiAoZXJyb3I/OiBFcnJvcikgPT4ge1xuICAgIGlmICghZXJyb3IpIHtcbiAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzLCByZWopID0+IHtcbiAgICAgICAgZXhlYyhgdHNjIC0tZW1pdERlY2xhcmF0aW9uT25seSAtLW91dERpciAuL2Rpc3QvdHlwZXNgLHtcbiAgICAgICAgICBjd2Q6IF9fZGlybmFtZVxuICAgICAgICB9LCBhc3luYyAoZXJyLCBzdGRvdXQsIHN0ZGVycikgPT4ge1xuICAgICAgICAgIGNvbnNvbGUud2FybigoYXdhaXQgY2hhbGspLnllbGxvdyhzdGRvdXQpKVxuICAgICAgICAgIHJlcygpXG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfVxuICB9LFxufTtcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogWyBcbiAgICBkdHMsXG4gICAgXG4gICAgdml0ZVN0YXRpY0NvcHkoe1xuICAgICAgdGFyZ2V0czogW1xuICAgICAgICB7XG4gICAgICAgICAgc3JjOiBub3JtYWxpemVQYXRoKHJlc29sdmUoX19kaXJuYW1lLCAncGFja2FnZS5qc29uJykpLFxuICAgICAgICAgIGRlc3Q6IFwiLi9cIixcbiAgICAgICAgfSxcbiAgICAgICAgICAgICAgXG4gICAgICAgIC8vIE5PVEU6IEFsbCBvZiB0aGVzZSBhcmUgcmVxdWlyZWQgZm9yIG5vdyB0byByZXNvbHZlIHRlbXBsYXRlIGJ1aWxkc1xuICAgICAgICAuLi50b0NvcHkubWFwKHBhdGggPT4ge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBzcmM6IG5vcm1hbGl6ZVBhdGgocmVzb2x2ZShfX2Rpcm5hbWUsIHBhdGgpKSArICcvWyEuXSonLFxuICAgICAgICAgICAgZGVzdDogam9pbihwYXRoKSxcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICBdLFxuICAgIH0pIFxuICBdLFxuICBidWlsZDoge1xuICAgIGVtcHR5T3V0RGlyOiBmYWxzZSxcbiAgICB0YXJnZXQ6ICdub2RlMTYnLFxuICAgIGxpYjoge1xuICAgICAgZW50cnk6IHtcbiAgICAgICAgbWFpbjogcmVzb2x2ZShfX2Rpcm5hbWUsICdpbmRleCcpLFxuICAgICAgICBzZXJ2aWNlczogcmVzb2x2ZShfX2Rpcm5hbWUsICdzZXJ2aWNlcy9pbmRleCcpLFxuICAgICAgICBjb25maWc6IHJlc29sdmUoX19kaXJuYW1lLCAnY29uZmlnJylcbiAgICAgIH0sXG4gICAgICBuYW1lOiAnc29saWRhcml0eScsXG4gICAgICBmb3JtYXRzOiBbJ2VzJywgJ2NqcyddLFxuICAgICAgZmlsZU5hbWU6IChmb3JtYXQsIGVudHJ5TmFtZSkgPT4gYCR7ZW50cnlOYW1lfS4ke2Zvcm1hdCA9PT0gJ2VzJyA/ICdtanMnIDogJ2Nqcyd9YFxuICAgIH0sXG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgLy8gb3V0cHV0OiB7XG4gICAgICAvLyAgIHByZXNlcnZlTW9kdWxlczogdHJ1ZSxcbiAgICAgIC8vIH0sXG4gICAgICBleHRlcm5hbDogQXJyYXkuZnJvbShuZXcgU2V0KFtcblxuICAgICAgICAvLyBFbnN1cmUgc2VsZiBpcyBoYW5kbGVkIGV4dGVybmFsbHlcbiAgICAgICAgJ0Bjb21tb25lcnMvc29saWRhcml0eScsXG5cbiAgICAgICAgLy8gVXNlci1kZWZpbmVkIGV4dGVybmFsIHBhY2thZ2VzXG4gICAgICAgIC4uLk9iamVjdC5rZXlzKHBrZy5kZXBlbmRlbmNpZXMpLFxuICAgICAgICAuLi5ub2RlQnVpbHRJbnNcbiAgICAgIF0pKSxcbiAgICB9LFxuICB9LFxufSkiLCAiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9Vc2Vycy9nYXJyZXR0Zmx5bm4vRG9jdW1lbnRzL0dpdEh1Yi9jb21tb25lcnMvcGFja2FnZXMvY29yZS91dGlsc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL2dhcnJldHRmbHlubi9Eb2N1bWVudHMvR2l0SHViL2NvbW1vbmVycy9wYWNrYWdlcy9jb3JlL3V0aWxzL2NvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvZ2FycmV0dGZseW5uL0RvY3VtZW50cy9HaXRIdWIvY29tbW9uZXJzL3BhY2thZ2VzL2NvcmUvdXRpbHMvY29uZmlnLmpzXCI7XG5jb25zdCBidWlsdElucyA9IFtcbiAgXCJub2RlOmNoaWxkX3Byb2Nlc3NcIixcbiAgXCJub2RlOmZzXCIsXG4gIFwibm9kZTp1cmxcIixcbiAgXCJub2RlOnBhdGhcIixcbiAgXCJub2RlOm5ldFwiLFxuICBcIm5vZGU6dXRpbFwiLFxuICBcIm5vZGU6b3NcIixcbiAgXCJub2RlOmh0dHBcIixcbiAgXCJub2RlOmh0dHBzXCIsXG4gIFwibm9kZTptb2R1bGVcIixcbiAgXCJub2RlOmNyeXB0b1wiXG5dXG5cbmV4cG9ydCBjb25zdCBub2RlQnVpbHRJbnMgPSBbLi4uYnVpbHRJbnMsIC4uLmJ1aWx0SW5zLm1hcCgoYikgPT4gYi5yZXBsYWNlKFwibm9kZTpcIiwgXCJcIikpXSJdLAogICJtYXBwaW5ncyI6ICI7QUFBc1csU0FBUyxvQkFBb0I7QUFFblksT0FBTyxTQUFTO0FBQ2hCLFNBQVMsTUFBTSxlQUFlO0FBQzlCLFNBQVMsb0JBQW9CO0FBRzdCLFNBQVMsWUFBWTs7O0FDTnJCLElBQU0sV0FBVztBQUFBLEVBQ2Y7QUFBQSxFQUNBO0FBQUEsRUFDQTtB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
