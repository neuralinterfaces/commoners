const { notarize } = require('@electron/notarize')

module.exports = async (context) => {
  if (process.platform !== 'darwin') return

  if (!('APPLE_ID' in process.env && 'APPLE_ID_PASSWORD' in process.env)) {
    console.warn('[commoners]: skipping notarizing, APPLE_ID and APPLE_ID_PASSWORD env variables must be set.')
    return
  }

  const { appOutDir, packager } = context
  
  const { appInfo } = packager

  const { productFilename, productName } = appInfo

  try {
    await notarize({
      appBundleId: `com.${productName.toLowerCase().replaceAll(/\s+/g, '')}.app`, // Ensure appId matches from build.ts
      appPath: `${appOutDir}/${productFilename}.app`,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD
    })
  } catch (error) {
    console.error(error)
  }

  console.log(`done notarizing ${appId}.`)
}
