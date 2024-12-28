import { builtinModules } from "node:module"
export const nodeBuiltIns = [...builtinModules, ...builtinModules.map((b) => `node:${b}`)]