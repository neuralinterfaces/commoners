import { chalk } from "../globals.js";
import { TargetType } from "../types.js";

export const printTarget = (target: TargetType) => {
    if (target === 'web') return 'Web'
    if (target === 'pwa') return 'PWA'
    if (target === 'electron') return 'Desktop'
    if (target === 'mobile') return 'Mobile'
    if (target === 'ios') return 'iOS'
    if (target === 'android') return 'Android'
    return target
}

export const printHeader = async (msg) => {
    const _chalk = await chalk
    console.log(`\n✊ ${_chalk.bold(msg)}\n`)
}


export const printServiceMessage = async (label, msg, type = 'log') => {
    const _chalk = await chalk
    console[type](`${_chalk.bold(_chalk.greenBright(`[${label}]`))} ${msg}`)
}