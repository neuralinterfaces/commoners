import { execFileSync } from "child_process";
import { platform, homedir } from "os";

import { createHash } from "crypto";
import { readFileSync, appendFileSync, existsSync } from "fs";
import path from "path";

// Runtime path to ASAR file and hash

export async function verifyAsarIntegrity(): Promise<boolean> {

const logFile = path.join(homedir(), 'neurotique', 'commoners.log')

  try {
    

    // Runtime path to ASAR file and hash
    const ASAR_PATH = path.join(process.resourcesPath, "app.asar");
    const HASH_PATH = path.join(process.resourcesPath, "app.asar.sha256");

    if (!existsSync(ASAR_PATH)) {
        console.warn("🔒 Skipping ASAR integrity check (app.asar not found)");
        return true; // don't fail in dev mode or unpacked builds
    }

            
    const expectedHash = readFileSync(HASH_PATH, "utf8").trim();
    const actualHash = createHash("sha256")
      .update(readFileSync(ASAR_PATH))
      .digest("hex");

    return expectedHash === actualHash;
  } catch (err) {
    const message = `ASAR integrity check failed: ${err.message}`;
    console.error(`🔒 ${message}`);
    appendFileSync(logFile, `🔒 ${message}\n`);

    return false;
  }
}

// Platform-Specific Binary Signature Check
export function verifyExecutableSignature(): boolean {
  try {
    const execPath = process.execPath;
    if (platform() === "win32") {
      const out = execFileSync("powershell.exe", [
        "-Command",
        `Get-AuthenticodeSignature "${execPath}" | ConvertTo-Json`
      ]).toString();
      const result = JSON.parse(out);
      return result.Status === "Valid";
    } else if (platform() === "darwin") {
      execFileSync("codesign", ["--verify", "--deep", "--strict", execPath]);
      return true;
    }
    return true; // Assume OK on Linux
  } catch (err) {
    const message = `Executable signature check failed: ${err.message}`;
    console.error(`🔒 ${message}`);
    appendFileSync(path.join(homedir(), 'neurotique', 'commoners.log'), `🔒 ${message}\n`);
    return false;
  }
}

export async function performRuntimeIntegrityChecks(): Promise<{ asar: boolean, signature: boolean }> {
  const asarOk = await verifyAsarIntegrity();
  const signatureOk = verifyExecutableSignature();
  return { asar: asarOk, signature: signatureOk };
}