import { execFileSync, execSync } from "child_process";
import { platform, homedir } from "os";

import { appendFileSync } from "fs";
import path from "path";

export function hasSignature(): boolean {
  try {

    const execPath = process.execPath;

    // macOS: use codesign to see if there's *any* signature
    if (process.platform === 'darwin') {
      const output = execSync(`codesign -d --verbose=2 "${execPath}"`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'], // suppress stderr warnings
      });
      return /Authority=/.test(output); // Indicates signature exists
    } 
    

    // Windows: check certificate status regardless of validity
    else if (process.platform === 'win32') {
      const exePath = process.execPath;
      const output = execSync(
        `powershell -Command "(Get-AuthenticodeSignature '${exePath}').SignerCertificate"`,
        { encoding: 'utf8' }
      ).trim();
      return output !== '' && output !== 'null';
    } 
    
    // Linux: assume no signature
    else return false;

  } catch (e) {
    return false;
  }
}

// Platform-Specific Binary Signature Check
export function verifySignature(): boolean {
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