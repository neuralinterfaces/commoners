import { extname } from 'node:path';

const mimeMap: Record<string, string> = {
  ".html": "text/html",
  ".htm": "text/html",
  ".js": "application/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain"
};

export function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return mimeMap[ext] || "application/octet-stream";
}