import { execFileSync } from "child_process";
import { platform, homedir } from "os";

import { appendFileSync } from "fs";
import path from "path";

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