/**
 * The identifier an app gets when its config sets no `appId`. It is used as the macOS bundle id,
 * the Windows AppUserModelID, the Tauri identifier and the Android/iOS application id, so it
 * must be valid on all of them: reverse-DNS segments of lowercase letters and digits, each
 * starting with a letter. It must not end in `.app`, which conflicts with the macOS bundle
 * extension.
 */
export const defaultAppId = (name: string) => {
  let slug = String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  if (!slug || slug === 'app') slug = 'commonersapp'
  if (/^[0-9]/.test(slug)) slug = `app${slug}`
  return `com.${slug}`
}
