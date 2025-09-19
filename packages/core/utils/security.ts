/* eslint-disable no-console */
import { join, basename } from "node:path";
import {
  existsSync, readdirSync, statSync, readFileSync, writeFileSync,
  openSync, readSync, closeSync
} from "node:fs";
import { createHash } from "node:crypto";
import plist from "plist";
import { flipFuses, FuseVersion, FuseV1Options } from "@electron/fuses";
import ffi from "ffi-napi";
import ref from "ref-napi";

/* ---------------- tiny utils ---------------- */
const log  = (...a: any[]) => console.log("[asar-integrity]", ...a);
const warn = (...a: any[]) => console.warn("[asar-integrity]", ...a);
const isWin = () => process.platform === "win32";
const isMac = () => process.platform === "darwin";

function sha256(buf: Buffer | Uint8Array) {
  return createHash("sha256").update(buf).digest("hex");
}

/* ---------------- locate main exe ---------------- */
function findExe(appOutDir: string, preferredBase?: string): string {
  if (preferredBase) {
    const p = join(appOutDir, `${preferredBase}.exe`);
    if (existsSync(p)) return p;
  }
  const exeNames = readdirSync(appOutDir).filter(n => /\.exe$/i.test(n));
  if (!exeNames.length) throw new Error(`No .exe found in ${appOutDir}`);
  let best = join(appOutDir, exeNames[0]), max = 0;
  for (const n of exeNames) {
    const p = join(appOutDir, n);
    try { const s = statSync(p); if (s.size > max) { max = s.size; best = p; } } catch {}
  }
  return best;
}

/* ---------------- read ASAR header bytes ---------------- */
// JSON header bytes (what @electron/asar.getRawHeader() returns)
function readJsonHeaderBytes(asarPath: string): Buffer | null {
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

// FULL header (12-byte prelude + JSON) for fallback on certain Electron builds
function readFullHeaderBytes(asarPath: string): Buffer | null {
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

/* ---------------- Win32 resource I/O (no CLIs) ---------------- */
type HMODULE = Buffer;
const K = isWin()
  ? ffi.Library("Kernel32", {
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
    })
  : null;

function wstr(s: string) { return Buffer.from(s + "\u0000", "ucs2"); }
function lastErr() { return (K as any).GetLastError(); }

function writeIntegrityResource(exePath: string, payloadJson: string) {
  if (!isWin()) return;
  const exeW = wstr(exePath);
  const typeW = wstr("Integrity");
  const nameW = wstr("ElectronAsar");
  const data  = Buffer.from(payloadJson, "utf8");

  const h: HMODULE = (K as any).BeginUpdateResourceW(exeW, false) as unknown as Buffer;
  // @ts-ignore
  if (!h || (h.isNull && h.isNull())) throw new Error(`BeginUpdateResourceW failed (err=${lastErr()})`);
  let ok = true; let err = 0;

  for (const lang of [1033, 0]) {
    const r = (K as any).UpdateResourceW(h, typeW, nameW, lang, data, data.length);
    if (!r) { ok = false; err = lastErr(); warn(`UpdateResourceW failed (lang=${lang}, err=${err})`); }
    else log(`UpdateResourceW OK (lang=${lang}, ${data.length} bytes)`);
  }
  const end = (K as any).EndUpdateResourceW(h, !ok);
  if (!end) throw new Error(`EndUpdateResourceW failed (err=${lastErr()})`);
  if (!ok)  throw new Error(`UpdateResourceW failed (err=${err})`);
}

function readIntegrityResource(exePath: string) {
  if (!isWin()) return [];
  const LOAD_LIBRARY_AS_DATAFILE = 0x00000002;
  const mod = (K as any).LoadLibraryExW(wstr(exePath), ref.NULL, LOAD_LIBRARY_AS_DATAFILE);
  // @ts-ignore
  if (!mod || (mod.isNull && mod.isNull())) throw new Error(`LoadLibraryExW failed (err=${lastErr()})`);
  const typeW = wstr("Integrity");
  const nameW = wstr("ElectronAsar");
  const langs = [1033, 0];

  const out: Array<{lang:number, found:boolean, json?:string, size?:number}> = [];
  for (const lang of langs) {
    const hRes = (K as any).FindResourceExW(mod, typeW, nameW, lang);
    // @ts-ignore
    if (!hRes || (hRes.isNull && hRes.isNull())) { out.push({ lang, found: false }); continue; }
    const size = (K as any).SizeofResource(mod, hRes);
    const hMem = (K as any).LoadResource(mod, hRes);
    const ptr  = (K as any).LockResource(hMem);
    let json: string | undefined;
    if (ptr && !(ptr as any).isNull?.() && size > 0) {
      json = Buffer.from(ref.reinterpret(ptr, size)).toString("utf8");
    }
    out.push({ lang, found: true, json, size });
  }
  (K as any).FreeLibrary(mod);
  return out;
}

/* ---------------- macOS plist ---------------- */
function writePlistIntegrity(infoPlistPath: string, headerHash: string) {
  const xml = readFileSync(infoPlistPath, "utf8");
  const obj: any = plist.parse(xml) || {};
  obj.ElectronAsarIntegrity = obj.ElectronAsarIntegrity || {};
  // MUST be exactly this key
  obj.ElectronAsarIntegrity["Resources/app.asar"] = { algorithm: "SHA256", hash: headerHash };
  const out = plist.build(obj);
  writeFileSync(infoPlistPath, out, "utf8");
}

/* ---------------- public hooks ---------------- */
/**
 * Embed ASAR integrity (Windows & macOS) in a robust way:
 *  1) Optionally run your asar patcher (mutateAsar) FIRST
 *  2) Hash JSON header; write resource/plist
 *  3) Verify by re-reading resource; if missing/mismatch on Win, retry with FULL header hash
 */
export type MutateAsarFn = (opts: { appOutDir: string, productName: string }) => Promise<void> | void;

export function makeAfterPackEmbedAsarIntegrity(mutateAsar?: MutateAsarFn) {
  return async function afterPackEmbedAsarIntegrity(context: any) {
    const { appOutDir, packager } = context;
    const product =
      packager?.appInfo?.productFilename || packager?.appInfo?.productName;

    // 1) let you modify app.asar BEFORE we hash it
    if (mutateAsar) {
      try { await mutateAsar({ appOutDir, productName: product }); }
      catch (e: any) { warn("mutateAsar failed:", e?.message || e); }
    }

    // 2) locate asar
    const asarPath = isMac()
      ? join(appOutDir, `${product}.app`, "Contents", "Resources", "app.asar")
      : join(appOutDir, "resources", "app.asar");
    if (!existsSync(asarPath)) { warn("resources/app.asar not found; skipping"); return; }

    // 3) hash JSON header (primary)
    const jsonHeader = readJsonHeaderBytes(asarPath);
    if (!jsonHeader?.length) { warn("ASAR JSON header unreadable; skipping"); return; }
    const jsonHash = sha256(jsonHeader);
    log("jsonHeaderSHA256:", jsonHash.slice(0, 12) + "…");

    if (isMac()) {
      const plistPath = join(appOutDir, `${product}.app`, "Contents", "Info.plist");
      if (!existsSync(plistPath)) { warn("Info.plist not found:", plistPath); return; }
      writePlistIntegrity(plistPath, jsonHash);
      log("Wrote ElectronAsarIntegrity → Info.plist");
      return;
    }

    if (isWin()) {
      const exePath = findExe(appOutDir, product);
      const payload = (h: string) =>
        JSON.stringify([{ file: "resources\\app.asar", alg: "sha256", value: h }]);

      // write JSON-hash payload first
      writeIntegrityResource(exePath, payload(jsonHash));

      // verify by native readback; if it didn’t stick, hard fail
      const hits = readIntegrityResource(exePath);
      const first = hits.find(h => h.found && h.json);
      if (!first) throw new Error("Integrity/ElectronAsar not found right after write");

      // check value matches what we wrote; if not, try FULL header hash
      let embedded: string | null = null;
      try {
        const arr = JSON.parse(first.json!);
        const rec = Array.isArray(arr) && arr.find((x: any) =>
          x && /resources\\app\.asar/i.test(x.file) && x.alg === "sha256"
        );
        embedded = rec && String(rec.value || "").toLowerCase();
      } catch {}

      if (embedded !== jsonHash) {
        warn("Embedded hash != jsonHeader hash; trying FULL header hash fallback…");
        const fullHeader = readFullHeaderBytes(asarPath);
        if (!fullHeader) throw new Error("FULL ASAR header unreadable");
        const fullHash = sha256(fullHeader);
        writeIntegrityResource(exePath, payload(fullHash));

        const hits2 = readIntegrityResource(exePath);
        const first2 = hits2.find(h => h.found && h.json);
        let embedded2: string | null = null;
        try {
          const arr2 = JSON.parse(first2?.json || "[]");
          const rec2 = Array.isArray(arr2) && arr2.find((x: any) =>
            x && /resources\\app\.asar/i.test(x.file) && x.alg === "sha256"
          );
          embedded2 = rec2 && String(rec2.value || "").toLowerCase();
        } catch {}
        if (embedded2 !== fullHash) {
          throw new Error("Failed to embed Windows integrity resource (both modes)");
        }
        log("Embedded FULL header hash OK");
      } else {
        log("Embedded JSON header hash OK");
      }
    }
  };
}

/** Flip fuses AFTER embedding integrity pointers. */
export async function afterPackFlipFuses(context: any) {
  try {
    const { appOutDir, packager } = context;
    const product =
      packager?.appInfo?.productFilename || packager?.appInfo?.productName;

    const targetPath = isWin()
      ? findExe(appOutDir, product)
      : isMac()
        ? join(appOutDir, `${product}.app`)
        : appOutDir;

    await flipFuses(targetPath, {
      version: FuseVersion.V1,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    });
    console.log("[fuses] flipped on", targetPath);
  } catch (e: any) {
    warn("Fuse flip failed:", e?.message || e);
  }
}

/** Chain multiple `afterPack` hooks safely. */
export function chainAfterPack(
  existing: ((ctx: any) => any) | undefined,
  ...fns: Array<(ctx: any) => any | Promise<any>>
) {
  if (!existing) return async (ctx: any) => { for (const fn of fns) await fn(ctx); };
  return async (ctx: any) => { await existing(ctx); for (const fn of fns) await fn(ctx); };
}
