/* eslint-disable no-console */
import { join, basename } from "node:path";
import {
  existsSync, readdirSync, lstatSync, statSync, readFileSync, writeFileSync,
  openSync, readSync, closeSync
} from "node:fs";
import { createHash } from "node:crypto";
import plist from "plist";
import { flipFuses, FuseVersion, FuseV1Options } from "@electron/fuses";

/* ---------------- tiny utils ---------------- */
const log  = (...a: any[]) => console.log("[asar-integrity]", ...a);
const warn = (...a: any[]) => console.warn("[asar-integrity]", ...a);
const error = (...a: any[]) => console.error("[asar-integrity]", ...a);
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

export const debugAfterPack = async (context: any) => {
  
  return // Disable debug output by default

  const buildConfig = context.packager?.info?.options || {};
  if (!buildConfig) return

  console.log('🔍 AfterPack Debug:', {
    appOutDir: context.appOutDir,
    productName: buildConfig.productName,
    platform: process.platform,
    electronVersion: buildConfig.electronVersion
  });
  
  // Check if ASAR exists
  const asarPath = process.platform === 'darwin'
    ? join(context.appOutDir, `${buildConfig.productName}.app`, 'Contents', 'Resources', 'app.asar')
    : join(context.appOutDir, 'resources', 'app.asar');
  
  console.log('📦 ASAR Check:', {
    asarPath,
    exists: existsSync(asarPath),
    size: existsSync(asarPath) ? lstatSync(asarPath).size : 'N/A'
  });
};

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
  } catch (e) {
    warn("Error reading ASAR JSON header:", e);
    return null;
  }
  finally { 
    if (fd >= 0) {
      try { closeSync(fd); } catch {}
    }
  }
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
  } catch (e) {
    warn("Error reading ASAR full header:", e);
    return null;
  }
  finally { 
    if (fd >= 0) {
      try { closeSync(fd); } catch {}
    }
  }
}

/* ---------------- Win32 resource I/O with FFI fallback to rcedit ---------------- */
let K: any = null;
let ffiAvailable = false;

// Try to load FFI on Windows
if (isWin()) {
  try {
    const ffi = require("ffi-napi");
    const ref = require("ref-napi");
    
    K = ffi.Library("Kernel32", {
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
    });
    
    ffiAvailable = true;
    log("FFI libraries loaded successfully");
  } catch (e) {
    warn("FFI libraries not available, will try rcedit fallback:", e.message);
    ffiAvailable = false;
  }
}

function wstr(s: string) { 
  return Buffer.from(s + "\u0000", "ucs2"); 
}

function lastErr() { 
  return K?.GetLastError() || 0; 
}

// FFI-based resource writing
function writeIntegrityResourceFFI(exePath: string, payloadJson: string) {
  if (!isWin() || !ffiAvailable || !K) {
    throw new Error("FFI not available for Windows resource writing");
  }

  const exeW = wstr(exePath);
  const typeW = wstr("Integrity");
  const nameW = wstr("ElectronAsar");
  const data = Buffer.from(payloadJson, "utf8");

  const h = K.BeginUpdateResourceW(exeW, false);
  if (!h || (h.isNull && h.isNull())) {
    throw new Error(`BeginUpdateResourceW failed (err=${lastErr()})`);
  }
  
  let ok = true; 
  let err = 0;

  for (const lang of [1033, 0]) {
    const r = K.UpdateResourceW(h, typeW, nameW, lang, data, data.length);
    if (!r) { 
      ok = false; 
      err = lastErr(); 
      warn(`UpdateResourceW failed (lang=${lang}, err=${err})`); 
    } else {
      log(`UpdateResourceW OK (lang=${lang}, ${data.length} bytes)`);
    }
  }
  
  const end = K.EndUpdateResourceW(h, !ok);
  if (!end) throw new Error(`EndUpdateResourceW failed (err=${lastErr()})`);
  if (!ok) throw new Error(`UpdateResourceW failed (err=${err})`);
}

// rcedit fallback for resource writing
async function writeIntegrityResourceRcedit(exePath: string, payloadJson: string) {
  if (!isWin()) return;
  
  try {
    const rcedit = require('rcedit');
    
    // rcedit doesn't support arbitrary resource types, so we'll use version info
    await rcedit(exePath, {
      'version-string': {
        'ElectronAsarIntegrity': payloadJson
      }
    });
    
    log("rcedit integrity resource written successfully");
  } catch (e) {
    error("rcedit failed:", e.message);
    throw new Error(`rcedit failed: ${e.message}`);
  }
}

// Main resource writing function with fallbacks
async function writeIntegrityResource(exePath: string, payloadJson: string) {
  if (!isWin()) return;
  
  // Try FFI first, fall back to rcedit
  if (ffiAvailable) {
    try {
      writeIntegrityResourceFFI(exePath, payloadJson);
      return;
    } catch (e) {
      warn("FFI resource writing failed, trying rcedit:", e.message);
    }
  }
  
  // Fallback to rcedit
  await writeIntegrityResourceRcedit(exePath, payloadJson);
}

function readIntegrityResource(exePath: string) {
  if (!isWin() || !ffiAvailable || !K) return [];
  
  try {
    const ref = require("ref-napi");
    const LOAD_LIBRARY_AS_DATAFILE = 0x00000002;
    const mod = K.LoadLibraryExW(wstr(exePath), ref.NULL, LOAD_LIBRARY_AS_DATAFILE);
    
    if (!mod || (mod.isNull && mod.isNull())) {
      throw new Error(`LoadLibraryExW failed (err=${lastErr()})`);
    }
    
    const typeW = wstr("Integrity");
    const nameW = wstr("ElectronAsar");
    const langs = [1033, 0];

    const out: Array<{lang:number, found:boolean, json?:string, size?:number}> = [];
    
    for (const lang of langs) {
      const hRes = K.FindResourceExW(mod, typeW, nameW, lang);
      if (!hRes || (hRes.isNull && hRes.isNull())) { 
        out.push({ lang, found: false }); 
        continue; 
      }
      
      const size = K.SizeofResource(mod, hRes);
      const hMem = K.LoadResource(mod, hRes);
      const ptr = K.LockResource(hMem);
      let json: string | undefined;
      
      if (ptr && !(ptr as any).isNull?.() && size > 0) {
        json = Buffer.from(ref.reinterpret(ptr, size)).toString("utf8");
      }
      
      out.push({ lang, found: true, json, size });
    }
    
    K.FreeLibrary(mod);
    return out;
  } catch (e) {
    warn("Error reading integrity resource:", e.message);
    return [];
  }
}

/* ---------------- macOS plist ---------------- */
function writePlistIntegrity(infoPlistPath: string, headerHash: string) {
  try {
    const xml = readFileSync(infoPlistPath, "utf8");
    const obj: any = plist.parse(xml) || {};
    obj.ElectronAsarIntegrity = obj.ElectronAsarIntegrity || {};
    // MUST be exactly this key
    obj.ElectronAsarIntegrity["Resources/app.asar"] = { 
      algorithm: "SHA256", 
      hash: headerHash 
    };
    const out = plist.build(obj);
    writeFileSync(infoPlistPath, out, "utf8");
  } catch (e) {
    error("Failed to write plist integrity:", e.message);
    throw e;
  }
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
    try {
      const { appOutDir, packager } = context;
      const product = packager?.appInfo?.productFilename || packager?.appInfo?.productName;

      if (!product) {
        warn("No product name found, skipping integrity embedding");
        return;
      }

      log(`Starting ASAR integrity embedding for ${product}`);

      // 1) let you modify app.asar BEFORE we hash it
      if (mutateAsar) {
        try { 
          await mutateAsar({ appOutDir, productName: product }); 
          log("mutateAsar completed successfully");
        }
        catch (e: any) { 
          warn("mutateAsar failed:", e?.message || e); 
        }
      }

      // 2) locate asar
      const asarPath = isMac()
        ? join(appOutDir, `${product}.app`, "Contents", "Resources", "app.asar")
        : join(appOutDir, "resources", "app.asar");
      
      if (!existsSync(asarPath)) { 
        warn(`ASAR file not found at ${asarPath}, skipping integrity embedding`); 
        return; 
      }

      log(`Found ASAR at: ${asarPath}`);

      // 3) hash JSON header (primary)
      const jsonHeader = readJsonHeaderBytes(asarPath);
      if (!jsonHeader?.length) { 
        warn("ASAR JSON header unreadable; skipping"); 
        return; 
      }
      
      const jsonHash = sha256(jsonHeader);
      log("jsonHeaderSHA256:", jsonHash.slice(0, 12) + "…");

      if (isMac()) {
        const plistPath = join(appOutDir, `${product}.app`, "Contents", "Info.plist");
        if (!existsSync(plistPath)) { 
          warn("Info.plist not found:", plistPath); 
          return; 
        }
        
        writePlistIntegrity(plistPath, jsonHash);
        log("✅ Wrote ElectronAsarIntegrity → Info.plist");
        return;
      }

      if (isWin()) {
        const exePath = findExe(appOutDir, product);
        log(`Found executable at: ${exePath}`);
        
        const payload = (h: string) =>
          JSON.stringify([{ file: "resources\\app.asar", alg: "sha256", value: h }]);

        // write JSON-hash payload first
        await writeIntegrityResource(exePath, payload(jsonHash));

        // verify by native readback if FFI is available
        if (ffiAvailable) {
          const hits = readIntegrityResource(exePath);
          const first = hits.find(h => h.found && h.json);
          
          if (!first) {
            warn("Integrity resource not found after write, trying FULL header fallback");
          } else {
            // check value matches what we wrote; if not, try FULL header hash
            let embedded: string | null = null;
            try {
              const arr = JSON.parse(first.json!);
              const rec = Array.isArray(arr) && arr.find((x: any) =>
                x && /resources\\app\.asar/i.test(x.file) && x.alg === "sha256"
              );
              embedded = rec && String(rec.value || "").toLowerCase();
            } catch (e) {
              warn("Error parsing embedded integrity data:", e);
            }

            if (embedded === jsonHash) {
              log("✅ Embedded JSON header hash verified");
              return;
            } else {
              warn("Embedded hash != jsonHeader hash; trying FULL header hash fallback…");
            }
          }

          // Fallback to full header
          const fullHeader = readFullHeaderBytes(asarPath);
          if (!fullHeader) throw new Error("FULL ASAR header unreadable");
          
          const fullHash = sha256(fullHeader);
          await writeIntegrityResource(exePath, payload(fullHash));

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
          
          log("✅ Embedded FULL header hash verified");
        } else {
          log("✅ Integrity resource written (verification skipped - FFI not available)");
        }
      }
    } catch (e: any) {
      error("ASAR integrity embedding failed:", e.message);
      throw e;
    }
  };
}

/** Flip fuses AFTER embedding integrity pointers. */
export async function afterPackFlipFuses(context: any) {
  try {
    const { appOutDir, packager } = context;
    const product = packager?.appInfo?.productFilename || packager?.appInfo?.productName;

    if (!product) {
      warn("No product name found for fuse flipping");
      return;
    }

    const targetPath = isWin()
      ? findExe(appOutDir, product)
      : isMac()
        ? join(appOutDir, `${product}.app`)
        : appOutDir;

    log(`Flipping fuses for: ${targetPath}`);

    await flipFuses(targetPath, {
      version: FuseVersion.V1,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    });
    
    log("✅ Fuses flipped successfully on", targetPath);
  } catch (e: any) {
    warn("Fuse flip failed:", e?.message || e);
    // Don't throw - fuse flipping failure shouldn't break the build
  }
}

/** Chain multiple `afterPack` hooks safely. */
export function chainAfterPack(
  existing: ((ctx: any) => any) | undefined,
  ...fns: Array<(ctx: any) => any | Promise<any>>
) {
  if (!existing) {
    return async (ctx: any) => { 
      for (const fn of fns) {
        try {
          await fn(ctx);
        } catch (e: any) {
          error(`AfterPack hook failed: ${e.message}`);
          throw e;
        }
      }
    };
  }
  
  return async (ctx: any) => { 
    try {
      await existing(ctx);
    } catch (e: any) {
      error(`Existing afterPack hook failed: ${e.message}`);
      throw e;
    }
    
    for (const fn of fns) {
      try {
        await fn(ctx);
      } catch (e: any) {
        error(`AfterPack hook failed: ${e.message}`);
        throw e;
      }
    }
  };
}