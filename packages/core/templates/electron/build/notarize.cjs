const { notarize } = require('@electron/notarize')

module.exports = async (context) => {
  if (process.platform !== 'darwin') return

  const envVariables = ['APPLE_TEAM_ID', 'APPLE_ID', 'APPLE_ID_PASSWORD']

  if (!envVariables.every((key) => !!process.env[key])) {
    console.warn(`Skipping notarizing, ${envVariables.join(' + ')} env variables must be set.`)
    return
  }

  const { appOutDir, packager } = context

  const { appInfo } = packager

  const { productFilename, productName } = appInfo

  await notarize({
    teamId: process.env.APPLE_TEAM_ID,
    appPath: `${appOutDir}/${productFilename}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASSWORD
  })
  .then(() => {
    console.log(`Done notarizing ${productName}.`)
  })
  .catch(e => {
    console.log(`Failed to notarize ${productName}: ${e}`)
  })
}
