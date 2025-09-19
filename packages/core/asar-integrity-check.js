#!/usr/bin/env node
/* scripts/asar-integrity-debug.js */

// node packages\core\asar-integrity-check.js --exe C:\Users\garre\Documents\GitHub\Neurotique\.commoners\electron\win-unpacked\Neurotique-2.exe verify
// node packages\core\asar-integrity-check.js --exe C:\Users\garre\Documents\GitHub\Neurotique\.commoners\electron\win-unpacked\Neurotique-2.exe dump 
// node packages\core\asar-integrity-check.js --exe C:\Users\garre\Documents\GitHub\Neurotique\.commoners\electron\win-unpacked\Neurotique-2.exe set --hash 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
// node packages\core\asar-integrity-check.js --exe C:\Users\garre\Documents\GitHub\Neurotique\.commoners\electron\win-unpacked\Neurotique-2.exe fuses
// node packages\core\asar-integrity-check.js --exe C:\Users\garre\Documents\GitHub\Neurotique\.commoners\electron\win-unpacked\Neurotique-2.exe fuses --flip


import { join, dirname } from "node:path";// node packages\core\asar-integrity-check.js --exe C:\Users\garre\Documents\GitHub\Neurotique\.commoners\electron\win-unpacked\Neurotique-2.exe --asar C:\Users\garre\Documents\GitHub\Neurotique\.commoners\electron\win-unpacked\resources\app.asar repair
import {
  existsSync, readFileSync, openSync, closeSync, readSync, writeFileSync  
} from "node:fs";
import { createHash } from "node:crypto";
import ffi from "ffi-napi";
import ref from "ref-napi";
import { NtExecutable, NtExecutableResource } from "pe-library";
import { flipFuses, FuseVersion, FuseV1Options } from "@electron/fuses";

const LOG = (...a) => console.log("[asar-debug]", ...a);
const WARN = (...a) => console.warn("[asar-debug]", ...a);
const isWin = process.platform === "win32";

function usage() {
  console.log(`
Usage:
  node scripts/asar-integrity-debug.js --exe "<path\\to\\App.exe>" [--asar "<path\\to\\resources\\app.asar>"] <command> [options]

Commands:
  verify              Print both hashes and exit 0 if match, 1 if mismatch
  dump                Print the Integrity/ElectronAsar JSON payload from the EXE (all langs)
  set --hash <HEX>    Overwrite the EXE's embedded hash with the given hex (no ASAR read)
  repair              Compute header hash from app.asar and write it into the EXE
  fuses               Print a reminder and (optionally) flip fuses with --flip
                      (OnlyLoadAppFromAsar + EnableEmbeddedAsarIntegrityValidation)

Examples:
  node ... --exe ".commoners/electron/win-unpacked/Neurotique-2.exe" verify
  node ... --exe ".commoners/electron/win-unpacked/Neurotique-2.exe" dump
  node ... --exe ".../Neurotique-2.exe" --asar ".../resources/app.asar" repair
  node ... --exe ".../Neurotique-2.exe" set --hash fe524b...d29e36
  node ... --exe ".../Neurotique-2.exe" fuses --flip
`);
}

/* ----------------------- small helpers ----------------------- */

function parseArgv() {
  const out = { _: [] };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const s = a[i];
    if (s.startsWith("--")) {
      const k = s.replace(/^--/, "");
      const v = (i + 1 < a.length && !a[i + 1].startsWith("--")) ? a[++i] : true;
      out[k] = v;
    } else {
      out._.push(s);
    }
  }
  return out;
}

// Read header BYTES of app.asar (this is what Electron hashes on Windows)
function readRawAsarHeader(asarPath) {
  let fd = -1;
  try {
    fd = openSync(asarPath, "r");
    const pre = Buffer.allocUnsafe(12);
    if (readSync(fd, pre, 0, 12, 0) !== 12) return null;
    const len0 = pre.readUInt32LE(0);
    const headerSize = pre.readUInt32LE(4);
    const jsonLen = pre.readUInt32LE(8);
    if (len0 !== 4 || headerSize !== 4 + jsonLen || jsonLen <= 0) return null;
    const jsonBuf = Buffer.allocUnsafe(jsonLen);
    if (readSync(fd, jsonBuf, 0, jsonLen, 12) !== jsonLen) return null;
    return jsonBuf;
  } catch (e) { return null; }
  finally { if (fd >= 0) try { closeSync(fd); } catch {} }
}

const sha256hex = (buf) => createHash("sha256").update(buf).digest("hex");

// Read Integrity/ElectronAsar resource JSON from EXE (all languages)
function readIntegrityResourceJSON(exePath) {
  const exe = NtExecutable.from(readFileSync(exePath), { ignoreCert: true });
  const res = NtExecutableResource.from(exe);
  const entries = Array.isArray(res.entries) ? res.entries : [];
  const hits = entries.filter(e =>
    e && e.type === "Integrity" && e.name === "ElectronAsar"
  );
  return hits.map(e => ({
    lang: e.lang,
    json: (() => {
      try { return Buffer.from(e.data).toString("utf8"); } catch { return ""; }
    })()
  }));
}

// Win32 update APIs
const kernel32 = isWin ? ffi.Library("Kernel32", {
  BeginUpdateResourceW: [ "pointer", [ "pointer", "bool" ] ],
  UpdateResourceW:      [ "bool",    [ "pointer", "pointer", "pointer", "uint16", "pointer", "uint32" ] ],
  EndUpdateResourceW:   [ "bool",    [ "pointer", "bool" ] ],
}) : null;

function wstr(s) { return Buffer.from(s + "\u0000", "ucs2"); }

// Overwrite resource in EXE with payload JSON (langs 1033 & 0)
function writeIntegrityResourceJSON(exePath, payloadJson) {
  if (!isWin) throw new Error("Windows-only operation");
  const exeW  = wstr(exePath);
  const typeW = wstr("Integrity");
  const nameW = wstr("ElectronAsar");
  const data  = Buffer.from(payloadJson, "utf8");

  const h = kernel32.BeginUpdateResourceW(exeW, false);
  // @ts-ignore
  if (!h || (h.isNull && h.isNull())) throw new Error("BeginUpdateResourceW failed");

  for (const lang of [1033, 0]) {
    const ok = kernel32.UpdateResourceW(h, typeW, nameW, lang, data, data.length);
    if (!ok) { kernel32.EndUpdateResourceW(h, true); throw new Error(`UpdateResourceW failed (lang=${lang})`); }
  }
  const endOk = kernel32.EndUpdateResourceW(h, false);
  if (!endOk) throw new Error("EndUpdateResourceW failed");
}

/* ----------------------- commands ----------------------- */

function cmd_dump(exePath) {
  const arr = readIntegrityResourceJSON(exePath);
  if (!arr.length) { WARN("No Integrity/ElectronAsar resource found."); return 2; }
  LOG("Found Integrity/ElectronAsar entries:");
  for (const { lang, json } of arr) {
    LOG(`  lang=${lang} json=${json}`);
  }
  return 0;
}

function cmd_verify(exePath, asarPathGuess) {
  // locate asar next to exe if not given
  const asarPath = asarPathGuess || join(dirname(exePath), "resources", "app.asar");
  if (!existsSync(asarPath)) { WARN("No app.asar at:", asarPath); return 2; }

  const header = readRawAsarHeader(asarPath);
  if (!header?.length) { WARN("ASAR header unreadable at:", asarPath); return 2; }
  const computed = sha256hex(header);

  const arr = readIntegrityResourceJSON(exePath);
  if (!arr.length) { WARN("No Integrity/ElectronAsar resource in EXE."); return 2; }

  // pick first resource with a hash payload
  let embedded = null;
  for (const { json } of arr) {
    try {
      const parsed = JSON.parse(json);
      const rec = Array.isArray(parsed) && parsed.find(x =>
        x && /resources\\app\.asar/i.test(x.file) && x.alg === "sha256" && typeof x.value === "string"
      );
      if (rec) { embedded = rec.value.toLowerCase(); break; }
    } catch {}
  }

  LOG("ASAR header hash (computed):", computed);
  if (!embedded) {
    WARN("Embedded JSON does not reference resources\\app.asar with sha256 value.");
    return 2;
  }
  LOG("Embedded hash (EXE resource):", embedded);

  if (embedded === computed) {
    LOG("OK: hashes match.");
    return 0;
  } else {
    WARN("MISMATCH: hashes differ.");
    // print a short diff hint
    LOG(`  computed: ${computed}`);
    LOG(`  embedded: ${embedded}`);
    return 1;
  }
}

function cmd_set(exePath, hex) {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("Invalid --hash (need 64 hex chars)");
  const payload = JSON.stringify([{ file: "resources\\app.asar", alg: "sha256", value: hex.toLowerCase() }]);
  writeIntegrityResourceJSON(exePath, payload);
  LOG("Updated EXE resource with provided hash.");
  return 0;
}

function cmd_repair(exePath, asarPathGuess) {
  const asarPath = asarPathGuess || join(dirname(exePath), "resources", "app.asar");
  if (!existsSync(asarPath)) throw new Error("No app.asar at: " + asarPath);
  const header = readRawAsarHeader(asarPath);
  if (!header?.length) throw new Error("ASAR header unreadable at: " + asarPath);
  const hex = sha256hex(header);
  const payload = JSON.stringify([{ file: "resources\\app.asar", alg: "sha256", value: hex }]);
  writeIntegrityResourceJSON(exePath, payload);
  LOG("Repaired: wrote computed header hash into EXE resource:", hex);
  return 0;
}

async function cmd_fuses(exePath, doFlip) {
  LOG("Reminder: you likely also want BOTH fuses enabled:");
  LOG("  - OnlyLoadAppFromAsar");
  LOG("  - EnableEmbeddedAsarIntegrityValidation");
  if (!doFlip) return 0;
  await flipFuses(exePath, {
    version: FuseVersion.V1,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  });
  LOG("Fuses flipped on", exePath);
  return 0;
}

/* ----------------------- main ----------------------- */
(async () => {
  try {
    const args = parseArgv();
    if (!args.exe || !args._.length) { usage(); process.exit(2); }
    const exePath = args.exe;
    const asarPath = args.asar || null;
    const cmd = String(args._[0]).toLowerCase();

    if (!existsSync(exePath)) throw new Error("No such exe: " + exePath);

    let code = 0;
    if (cmd === "dump") {
      code = cmd_dump(exePath);
    } else if (cmd === "verify") {
      code = cmd_verify(exePath, asarPath);
    } else if (cmd === "set") {
      const hex = args.hash && String(args.hash);
      if (!hex) throw new Error("set requires --hash <HEX>");
      code = cmd_set(exePath, hex);
    } else if (cmd === "repair") {
      code = cmd_repair(exePath, asarPath);
    } else if (cmd === "fuses") {
      code = await cmd_fuses(exePath, !!args.flip);
    } else {
      usage(); code = 2;
    }

    process.exit(code);
  } catch (e) {
    WARN("ERROR:", e && e.message || e);
    process.exit(1);
  }
})();
