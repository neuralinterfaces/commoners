import crypto from 'node:crypto';
import { basename, extname, resolve } from 'node:path';
import { c } from 'vitest/dist/reporters-5f784f42.js';

// Generate a session-specific random seed
const seed = crypto.randomBytes(16).toString('hex');

/**
 * Generates a random set of characters based on the hash of an input path.
 * @param {string} inputPath - The absolute path to be hashed.
 * @param {string} seed - The seed to ensure different outputs for different runs.
 * @param {number} length - The length of the random string to generate.
 * @returns {string} - The generated random string.
 */
export function encode(inputPath, length) {
  // Hash the absolute path combined with the seed
  const hash = crypto.createHash('sha256').update(inputPath + seed).digest('hex');

  // Convert the hash to a random string
  const randomChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = parseInt(hash.slice(i * 2, i * 2 + 2), 16) % randomChars.length;
    result += randomChars[randomIndex];
  }
  return result;
}

export const encodePath = (input: string) => {

  if (input === 'commoners.config.cjs') return 'commoners.config.cjs' // Ensure consistently resolved by Electron

  input = resolve(input) // Resolve to absolute path
  const ext = extname(input)
  return `${basename(input, ext)}-${encode(input, 16)}${ext}`
}