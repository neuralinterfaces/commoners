/* utils/security.ts */
/* eslint-disable no-console */
import { join, basename } from "node:path";
import {
  existsSync, readdirSync, statSync, readFileSync, writeFileSync,
  openSync, readSync, closeSync,
} from "node:fs";
import { createHash } from "node:crypto";
import plist from "plist";
import { flipFuses, FuseVersion, FuseV1Options } from "@electron/fuses";
import * as asar from "@electron/asar"; // ok if present; we fallback if needed

// Win32 FFI (no dynamic imports)
import ffi from "ffi-napi";
import ref from "ref-napi";

// ---------- tiny helpers ----------
const log  = (...a: any[]) => console.log("[asar-integrity]", ...a);
const warn = (...a: any[]) => console.warn("[asar-integrity]", ...a);
const isWin = () => process.platform === "win32";
const isMac = () => process.platform === "darwin";

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

// Prefer @electron/asar.getRawHeader, else manual parse
function readRawAsarHeader(asarPath: string): Buffer | null {
  try {
    // @ts-ignore types not always present
    const raw = (asar as any).getRawHeader?.(asarPath);
    if (raw && Buffer.isBuffer(raw) && raw.length) return raw;
  } catch {}
  // Manual: [0..3]=4, [4..7]=headerSize (=4+jsonLen), [8..11]=jsonLen, then JSON bytes
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
  } catch { return null; }
  finally { if (fd >= 0) try { closeSync(fd); } catch {} }
}

const sha256Hex = (buf: Buffer | Uint8Array) => createHash("sha256").update(buf).digest("hex");

// ---------- Windows: inject resource via Win32 API ----------
type HMODULE = Buffer;
const kernel32 = isWin()
  ? ffi.Library("Kernel32", {
      BeginUpdateResourceW: [ "pointer", [ "pointer", "bool" ] ],
      UpdateResourceW:      [ "bool",    [ "pointer", "pointer", "pointer", "uint16", "pointer", "uint32" ] ],
      EndUpdateResourceW:   [ "bool",    [ "pointer", "bool" ] ],
    })
  : null;

function wstr(s: string): Buffer { return Buffer.from(s + "\u0000", "ucs2"); }

function injectWinIntegrityResource(exePath: string, payloadUtf8: string) {
  if (!kernel32) throw new Error("Win32 API not available");
  const exeW  = wstr(exePath);
  const typeW = wstr("Integrity");
  const nameW = wstr("ElectronAsar");
  const data  = Buffer.from(payloadUtf8, "utf8");

  const h: HMODULE = kernel32.BeginUpdateResourceW(exeW, false) as unknown as Buffer;
  // @ts-ignore
  if (!h || (h.isNull && h.isNull())) throw new Error("BeginUpdateResourceW failed");

  for (const lang of [1033, 0]) {
    const ok = kernel32.UpdateResourceW(h, typeW, nameW, lang, data, data.length);
    if (!ok) { kernel32.EndUpdateResourceW(h, true as any); throw new Error(`UpdateResourceW failed (lang=${lang})`); }
  }
  const endOk = kernel32.EndUpdateResourceW(h, false);
  if (!endOk) throw new Error("EndUpdateResourceW failed");
}

// ---------- macOS: write Info.plist ElectronAsarIntegrity ----------
function writePlistIntegrity(infoPlistPath: string, headerHash: string) {
  const xml = readFileSync(infoPlistPath, "utf8");
  const obj: any = plist.parse(xml) || {};
  const key = "ElectronAsarIntegrity";
  obj[key] = obj[key] || {};
  // MUST be this key path
  obj[key]["Resources/app.asar"] = { algorithm: "SHA256", hash: headerHash };
  const outXml = plist.build(obj);
  writeFileSync(infoPlistPath, outXml, "utf8");
}

// ---------- PUBLIC: electron-builder afterPack hooks ----------
/**
 * Optional hook: if you still patch app.asar (e.g., test-only shims),
 * do it here so the **final** header is what we hash.
 * If you don't need it, just leave it undefined when wiring.
 */
export type MutateAsarFn = (opts: { appOutDir: string, productName: string }) => Promise<void> | void;

/**
 * Embed ASAR integrity (Windows & macOS).
 * IMPORTANT: If you mutate app.asar, do it BEFORE we compute the hash.
 */
export function makeAfterPackEmbedAsarIntegrity(mutateAsar?: MutateAsarFn) {
  return async function afterPackEmbedAsarIntegrity(context: any) {
    const { appOutDir, packager } = context;
    const product =
      packager?.appInfo?.productFilename || packager?.appInfo?.productName;

    // 1) (optional) mutate app.asar before hashing
    if (mutateAsar) {
      try { await mutateAsar({ appOutDir, productName: product }); }
      catch (e: any) { warn("mutateAsar failed:", e?.message || e); }
    }

    // 2) locate asar
    const asarPath = isMac()
      ? join(appOutDir, `${product}.app`, "Contents", "Resources", "app.asar")
      : join(appOutDir, "resources", "app.asar");

    if (!existsSync(asarPath)) {
      warn("resources/app.asar not found; skipping integrity embedding.");
      return;
    }

    // 3) read header & hash
    const header = readRawAsarHeader(asarPath);
    if (!header?.length) { warn("ASAR header unreadable/empty"); return; }
    const headerHash = sha256Hex(header);
    log("Header bytes:", header.length, "hash:", headerHash.slice(0, 12) + "…");

    // 4) write per-OS integrity “pointer” to the hash
    if (isMac()) {
      const plistPath = join(appOutDir, `${product}.app`, "Contents", "Info.plist");
      if (!existsSync(plistPath)) { warn("Info.plist not found:", plistPath); return; }
      writePlistIntegrity(plistPath, headerHash);
      log("Wrote ElectronAsarIntegrity to Info.plist");
    } else if (isWin()) {
      const exePath = findExe(appOutDir, product);
      // Windows expects JSON array payload:
      // [ { "file":"resources\\app.asar","alg":"sha256","value":"<hash>" } ]
      const payload = JSON.stringify([{ file: "resources\\app.asar", alg: "sha256", value: headerHash }]);
      injectWinIntegrityResource(exePath, payload);
      log(`Injected Integrity/ElectronAsar into ${basename(exePath)}`);
    } else {
      log("Linux build: no ASAR integrity embedding required");
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

/** Chain multiple afterPack hooks safely. */
export function chainAfterPack(
  existing: ((ctx: any) => any) | undefined,
  ...fns: Array<(ctx: any) => any | Promise<any>>
) {
  if (!existing) return async (ctx: any) => { for (const fn of fns) await fn(ctx); };
  return async (ctx: any) => { await existing(ctx); for (const fn of fns) await fn(ctx); };
}
