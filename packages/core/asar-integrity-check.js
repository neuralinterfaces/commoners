#!/usr/bin/env node
/* scripts/asar-integrity-debug.js */

// node packages\core\asar-integrity-check.js --exe C:\Users\garre\Documents\GitHub\Neurotique\.commoners\electron\win-unpacked\Neurotique-2.exe dump
// node packages\core\asar-integrity-check.js --exe C:\Users\garre\Documents\GitHub\Neurotique\.commoners\electron\win-unpacked\Neurotique-2.exe verify-native
// node packages\core\asar-integrity-check.js --exe C:\Users\garre\Documents\GitHub\Neurotique\.commoners\electron\win-unpacked\Neurotique-2.exe --asar C:\Users\garre\Documents\GitHub\Neurotique\.commoners\electron\win-unpacked\resources\app.asar repair
// node packages\core\asar-integrity-check.js --exe C:\Users\garre\Documents\GitHub\Neurotique\.commoners\electron\win-unpacked\Neurotique-2.exe --asar C:\Users\garre\Documents\GitHub\Neurotique\.commoners\electron\win-unpacked\resources\app.asar repair-full
// node packages\core\asar-integrity-check.js --exe C:\Users\garre\Documents\GitHub\Neurotique\.commoners\electron\win-unpacked\Neurotique-2.exe fuses --flip

/* eslint-disable no-console */
import { join, dirname } from "node:path";
import { existsSync, openSync, closeSync, readSync } from "node:fs";
import { createHash } from "node:crypto";
import ffi from "ffi-napi";
import ref from "ref-napi";
import { flipFuses, FuseVersion, FuseV1Options } from "@electron/fuses";

const LOG  = (...a) => console.log("[asar-debug]", ...a);
const WARN = (...a) => console.warn("[asar-debug]", ...a);
const isWin = process.platform === "win32";

function usage() {
  console.log(`
Usage:
  node packages\\core\\asar-integrity-check.js --exe <path\\to\\App.exe> [--asar <path\\to\\resources\\app.asar>] <command> [options]

Commands:
  dump                  Show Integrity/ElectronAsar JSON payload (native + fallback)
  dump-all              Enumerate ALL resources (type/name/lang/size) via native API
  verify                Compare EXE's embedded hash vs JSON-header hash of app.asar
  verify-native         Check presence & size of Integrity/ElectronAsar via native API
  set --hash <HEX>      Force set embedded JSON (langs 1033 & 0) to the given 64-hex
  repair                Compute JSON-header hash from app.asar; write to EXE
  repair-full           Compute FULL-header (12+JSON) hash; write to EXE
  fuses [--flip]        Print reminder; with --flip toggles the two key fuses

Examples:
  node ... --exe ".commoners\\electron\\win-unpacked\\Neurotique-2.exe" dump
  node ... --exe "...\\Neurotique-2.exe" --asar "...\\resources\\app.asar" verify
  node ... --exe "...\\Neurotique-2.exe" --asar "...\\resources\\app.asar" repair
  node ... --exe "...\\Neurotique-2.exe" set --hash 0123...abcd
  node ... --exe "...\\Neurotique-2.exe" verify-native
  node ... --exe "...\\Neurotique-2.exe" dump-all
`);
}

/* ---------------- ASAR header readers ---------------- */

// Raw JSON header bytes (what @electron/asar.getRawHeader() returns)
function readJsonHeaderBytes(asarPath) {
  let fd = -1;
  try {
    fd = openSync(asarPath, "r");
    const pre = Buffer.allocUnsafe(12);
    if (readSync(fd, pre, 0, 12, 0) !== 12) return null;
    const len0 = pre.readUInt32LE(0);
    const headerSize = pre.readUInt32LE(4);
    const jsonLen = pre.readUInt32LE(8);
    if (len0 !== 4 || headerSize !== 4 + jsonLen || jsonLen <= 0) return null;
    const json = Buffer.allocUnsafe(jsonLen);
    if (readSync(fd, json, 0, jsonLen, 12) !== jsonLen) return null;
    return json;
  } catch { return null; }
  finally { if (fd >= 0) try { closeSync(fd); } catch {} }
}

// FULL header block (12-byte prelude + JSON)
function readFullHeaderBytes(asarPath) {
  let fd = -1;
  try {
    fd = openSync(asarPath, "r");
    const pre = Buffer.allocUnsafe(12);
    if (readSync(fd, pre, 0, 12, 0) !== 12) return null;
    const jsonLen = pre.readUInt32LE(8);
    if (jsonLen <= 0) return null;
    const full = Buffer.allocUnsafe(12 + jsonLen);
    pre.copy(full, 0, 0, 12);
    if (readSync(fd, full, 12, jsonLen, 12) !== jsonLen) return null;
    return full;
  } catch { return null; }
  finally { if (fd >= 0) try { closeSync(fd); } catch {} }
}

const sha256hex = (buf) => createHash("sha256").update(buf).digest("hex");

/* ---------------- Native (Win32) resource helpers ---------------- */

if (!isWin) WARN("Windows-only write/verify; non-Windows commands will no-op.");

const K = isWin ? ffi.Library("Kernel32", {
  GetLastError:         [ "uint32", [] ],
  BeginUpdateResourceW: [ "pointer", [ "pointer", "bool" ] ],
  UpdateResourceW:      [ "bool",    [ "pointer", "pointer", "pointer", "uint16", "pointer", "uint32" ] ],
  EndUpdateResourceW:   [ "bool",    [ "pointer", "bool" ] ],
  LoadLibraryExW:       [ "pointer", [ "pointer", "pointer", "uint32" ] ],
  FindResourceExW:      [ "pointer", [ "pointer", "pointer", "pointer", "uint16" ] ],
  SizeofResource:       [ "uint32",  [ "pointer", "pointer" ] ],
  LoadResource:         [ "pointer", [ "pointer", "pointer" ] ],
  LockResource:         [ "pointer", [ "pointer" ] ],
  FreeLibrary:          [ "bool",    [ "pointer" ] ],
}) : null;

function wstr(s) { return Buffer.from(s + "\u0000", "ucs2"); }
function lastErr() { return K.GetLastError(); }

function nativeWriteIntegrityJson(exePath, jsonString) {
  if (!isWin) throw new Error("Windows-only");
  const exeW  = wstr(exePath);
  const typeW = wstr("Integrity");
  const nameW = wstr("ElectronAsar");
  const data  = Buffer.from(jsonString, "utf8");

  const h = K.BeginUpdateResourceW(exeW, false);
  // @ts-ignore
  if (!h || (h.isNull && h.isNull())) {
    const code = lastErr();
    throw new Error(`BeginUpdateResourceW failed (err=${code})`);
  }
  let ok = true, code = 0;

  for (const lang of [1033, 0]) {
    const r = K.UpdateResourceW(h, typeW, nameW, lang, data, data.length);
    if (!r) { ok = false; code = lastErr(); WARN(`UpdateResourceW failed (lang=${lang}, err=${code})`); }
    else LOG(`UpdateResourceW OK (lang=${lang}, ${data.length} bytes)`);
  }

  const endOK = K.EndUpdateResourceW(h, !ok /* discard if failed */);
  if (!endOK) {
    const e2 = lastErr();
    throw new Error(`EndUpdateResourceW failed (err=${e2})`);
  }
  if (!ok) throw new Error(`UpdateResourceW failed (see logs), changes discarded`);
  LOG("EndUpdateResourceW OK");
}

// Native check: does Integrity/ElectronAsar exist? (return JSON buffers & sizes if possible)
function nativeProbeIntegrity(exePath) {
  if (!isWin) return [];
  const LOAD_LIBRARY_AS_DATAFILE = 0x00000002;
  const mod = K.LoadLibraryExW(wstr(exePath), ref.NULL, LOAD_LIBRARY_AS_DATAFILE);
  // @ts-ignore
  if (!mod || (mod.isNull && mod.isNull())) {
    const code = lastErr();
    throw new Error(`LoadLibraryExW failed (err=${code})`);
  }
  const typeW = wstr("Integrity");
  const nameW = wstr("ElectronAsar");
  const langs = [1033, 0];

  const out = [];
  for (const lang of langs) {
    const hRes = K.FindResourceExW(mod, typeW, nameW, lang);
    // @ts-ignore
    if (!hRes || (hRes.isNull && hRes.isNull())) {
      out.push({ lang, found: false });
      continue;
    }
    const size = K.SizeofResource(mod, hRes);
    const hMem = K.LoadResource(mod, hRes);
    const ptr  = K.LockResource(hMem);
    let json = null;
    if (ptr && !ptr.isNull?.() && size > 0) {
      json = Buffer.from(ref.reinterpret(ptr, size)).toString("utf8");
    }
    out.push({ lang, found: true, size, json });
  }
  K.FreeLibrary(mod);
  return out;
}

/* ---------------- Commands ---------------- */

function parseArgv() {
  const out = { _: [] };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const s = a[i];
    if (s.startsWith("--")) {
      const k = s.slice(2);
      const v = (i + 1 < a.length && !a[i + 1].startsWith("--")) ? a[++i] : true;
      out[k] = v;
    } else out._.push(s);
  }
  return out;
}

function cmd_dump(exePath) {
  try {
    const hits = nativeProbeIntegrity(exePath);
    const any = hits.some(h => h.found);
    if (!any) { WARN("No Integrity/ElectronAsar resource found."); return 2; }
    LOG("Integrity/ElectronAsar entries:");
    for (const h of hits) {
      LOG(`  lang=${h.lang} found=${h.found} size=${h.size||0} json=${h.json||""}`);
    }
    return 0;
  } catch (e) {
    WARN("dump error:", e.message || e);
    return 2;
  }
}

function cmd_dump_all(exePath) {
  try {
    // quick-and-dirty: just probe the target type/name and report if absent
    const hits = nativeProbeIntegrity(exePath);
    for (const h of hits) LOG(`[probe] lang=${h.lang} found=${h.found} size=${h.size||0}`);
    LOG("(Note) dump-all focuses on Integrity/ElectronAsar. For full table, use a PE viewer.");
    return 0;
  } catch (e) {
    WARN("dump-all error:", e.message || e);
    return 2;
  }
}

function cmd_verify(exePath, asarPathGuess) {
  const asarPath = asarPathGuess || join(dirname(exePath), "resources", "app.asar");
  if (!existsSync(asarPath)) { WARN("No app.asar at:", asarPath); return 2; }

  const json = readJsonHeaderBytes(asarPath);
  if (!json?.length) { WARN("ASAR JSON header unreadable:", asarPath); return 2; }
  const computed = sha256hex(json);

  const hits = nativeProbeIntegrity(exePath);
  const first = hits.find(h => h.found && h.json);
  if (!first) { WARN("No Integrity/ElectronAsar resource in EXE."); return 2; }

  let embedded = null;
  try {
    const arr = JSON.parse(first.json);
    const rec = Array.isArray(arr) && arr.find(x => x && /resources\\app\.asar/i.test(x.file) && x.alg === "sha256");
    embedded = rec && String(rec.value || "").toLowerCase();
  } catch {}
  LOG("ASAR jsonHeaderSHA256 (computed):", computed);
  LOG("Embedded hash (EXE resource):   ", embedded || "<none>");

  if (embedded && embedded === computed) {
    LOG("OK: hashes match.");
    return 0;
  }
  WARN("MISMATCH or missing.");
  return 1;
}

function cmd_set(exePath, hex) {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("Invalid --hash (expect 64 hex chars)");
  const payload = JSON.stringify([{ file: "resources\\app.asar", alg: "sha256", value: hex.toLowerCase() }]);
  nativeWriteIntegrityJson(exePath, payload);
  LOG("Updated EXE resource with provided hash.");
  // show what Windows sees:
  cmd_dump(exePath);
  return 0;
}

function cmd_repair(exePath, asarPathGuess) {
  const asarPath = asarPathGuess || join(dirname(exePath), "resources", "app.asar");
  if (!existsSync(asarPath)) throw new Error("No app.asar at: " + asarPath);
  const json = readJsonHeaderBytes(asarPath);
  if (!json?.length) throw new Error("ASAR JSON header unreadable: " + asarPath);
  const hex = sha256hex(json);
  const payload = JSON.stringify([{ file: "resources\\app.asar", alg: "sha256", value: hex }]);
  nativeWriteIntegrityJson(exePath, payload);
  LOG("Repaired (JSON header hash):", hex);
  cmd_dump(exePath);
  return 0;
}

function cmd_repair_full(exePath, asarPathGuess) {
  const asarPath = asarPathGuess || join(dirname(exePath), "resources", "app.asar");
  if (!existsSync(asarPath)) throw new Error("No app.asar at: " + asarPath);
  const full = readFullHeaderBytes(asarPath);
  if (!full?.length) throw new Error("ASAR full header unreadable: " + asarPath);
  const hex = sha256hex(full);
  const payload = JSON.stringify([{ file: "resources\\app.asar", alg: "sha256", value: hex }]);
  nativeWriteIntegrityJson(exePath, payload);
  LOG("Repaired (FULL header hash):", hex);
  cmd_dump(exePath);
  return 0;
}

async function cmd_fuses(exePath, flip) {
  LOG("Reminder: use BOTH fuses:");
  LOG("  - OnlyLoadAppFromAsar");
  LOG("  - EnableEmbeddedAsarIntegrityValidation");
  if (!flip) return 0;
  await flipFuses(exePath, {
    version: FuseVersion.V1,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  });
  LOG("Fuses flipped on", exePath);
  return 0;
}

/* ---------------- main ---------------- */
(async () => {
  try {
    const args = parseArgv();
    if (!args.exe || !args._.length) { usage(); process.exit(2); }
    const exePath = String(args.exe);
    const asarPath = args.asar ? String(args.asar) : null;
    const cmd = String(args._[0]).toLowerCase();

    if (!existsSync(exePath)) throw new Error("No such exe: " + exePath);

    let code = 0;
    if (cmd === "dump")            code = cmd_dump(exePath);
    else if (cmd === "dump-all")   code = cmd_dump_all(exePath);
    else if (cmd === "verify")     code = cmd_verify(exePath, asarPath);
    else if (cmd === "verify-native") { const r = nativeProbeIntegrity(exePath); console.log(r); code = 0; }
    else if (cmd === "set")        { const hex = String(args.hash||""); if (!hex) throw new Error("set requires --hash <HEX>"); code = cmd_set(exePath, hex); }
    else if (cmd === "repair")     code = cmd_repair(exePath, asarPath);
    else if (cmd === "repair-full")code = cmd_repair_full(exePath, asarPath);
    else if (cmd === "fuses")      code = await cmd_fuses(exePath, !!args.flip);
    else { usage(); code = 2; }

    process.exit(code);
  } catch (e) {
    WARN("ERROR:", e && e.message || e);
    process.exit(1);
  }
})();
