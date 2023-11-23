const { notarize } = require('@electron/notarize')

module.exports = async (context) => {
  if (process.platform !== 'darwin') return

  if (!('APPLE_ID' in process.env && 'APPLE_ID_PASSWORD' in process.env)) {
    console.warn('[commoners]: skipping notarizing, APPLE_ID and APPLE_ID_PASSWORD env variables must be set.')
    return
  }

  const { appOutDir, appInfo } = context

  const appId = `com.${appInfo.productName}.app` // Ensure appId matches what is expected 

  const appName = context.packager.appInfo.productFilename

  try {
    await notarize({
      appBundleId: appId,
      appPath: `${appOutDir}/${appName}.app`,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD
    })
  } catch (error) {
    console.error(error)
  }

  console.log(`done notarizing ${appId}.`)
}
