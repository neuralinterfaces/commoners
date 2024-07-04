
const { notarize } = require('@electron/notarize')

module.exports = async (context) => {
  if (process.platform !== 'darwin') return

  const envVariables = ['APPLE_TEAM_ID', 'APPLE_ID', 'APPLE_ID_PASSWORD']

  if (!envVariables.every((key) => !!process.env[key])) {
    console.log(`\nSkipping notarization: ${envVariables.join(' + ')} env variables must be set.\n`)
    return
  }

  const { appOutDir, packager } = context

  const { appInfo } = packager

  const { productFilename, productName, info } = appInfo

  const { appId, mac } = info._configuration

  if (mac.identity === null) return // Code-signing was not performed

  const appPath = `${appOutDir}/${productFilename}.app`
  console.log(`\nNotarizing ${productName} (${appId})`)

  await notarize({
    teamId: process.env.APPLE_TEAM_ID,
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASSWORD
  })
  .catch(e => console.error(`\nFailed to notarize: ${e}`))
}
