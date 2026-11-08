import { describe, test, expect, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  createSenderPolicy,
  isAllowedSenderUrl,
  senderRejection,
} from '../packages/core/assets/electron/modules/ipc-sender'
import * as IPC from '../packages/core/assets/electron/modules/ipc'

// Electron's WebFrameMain, reduced to what the check reads
const frame = (url: string, parent: any = null) => ({ url, parent })
const eventFrom = (senderFrame: any) => ({ senderFrame }) as any

const appRoot = join(process.cwd(), 'fake-app', 'resources', 'app.asar')
const packaged = createSenderPolicy({ appOrigin: 'app://local' })
const dev = createSenderPolicy({ devServerUrl: 'http://localhost:5173/' })
const fileOrigin = createSenderPolicy({ fileRoot: appRoot })

describe('IPC sender validation: which frames may send', () => {
  test('a packaged app page (app://local) is allowed', () => {
    expect(senderRejection(eventFrom(frame('app://local/index.html')), packaged)).toBeNull()
    expect(senderRejection(eventFrom(frame('app://local/pages/b.html?x=1#y')), packaged)).toBeNull()
  })

  test('a dev server page is allowed in development, and only that port', () => {
    expect(senderRejection(eventFrom(frame('http://localhost:5173/index.html')), dev)).toBeNull()
    expect(
      senderRejection(eventFrom(frame('http://localhost:5174/index.html')), dev)
    ).not.toBeNull()
    expect(senderRejection(eventFrom(frame('app://local/index.html')), dev)).not.toBeNull()
  })

  test('a frame from a foreign origin is rejected', () => {
    for (const url of [
      'https://example.com/',
      'http://localhost:5173/',
      'app://other/index.html',
      'file:///etc/passwd',
      'data:text/html,hi',
      'about:blank',
      '',
    ])
      expect(senderRejection(eventFrom(frame(url)), packaged), url).toMatch(/Rejected IPC/)
  })

  test('a subframe from another origin inside an app page is rejected', () => {
    const top = frame('app://local/index.html')
    const sub = frame('https://example.com/embed', top)
    expect(senderRejection(eventFrom(sub), packaged)).toMatch(/Rejected IPC from a frame at https/)
  })

  test('an app frame embedded in a foreign page is rejected', () => {
    const top = frame('https://example.com/')
    const sub = frame('app://local/index.html', top)
    expect(senderRejection(eventFrom(sub), packaged)).toMatch(/inside https:\/\/example\.com/)
  })

  test('a same-origin subframe is allowed', () => {
    const top = frame('app://local/index.html')
    expect(senderRejection(eventFrom(frame('app://local/frame.html', top)), packaged)).toBeNull()
  })

  test('a missing sender frame, or no policy, is rejected (fails closed)', () => {
    expect(senderRejection(eventFrom(null), packaged)).toMatch(/no sender frame/)
    expect(senderRejection({} as any, packaged)).toMatch(/no sender frame/)
    expect(senderRejection(eventFrom(frame('app://local/index.html')), null)).toMatch(
      /not configured/
    )
  })

  test('file:// pages are allowed only inside the app files, and only when pages load from file://', () => {
    const inside = pathToFileURL(join(appRoot, 'index.html')).href
    const nested = pathToFileURL(join(appRoot, 'pages', 'a', 'index.html')).href
    const outside = pathToFileURL(join(appRoot, '..', 'other', 'index.html')).href
    const sibling = pathToFileURL(appRoot + '-evil' + '/index.html').href
    expect(isAllowedSenderUrl(inside, fileOrigin)).toBe(true)
    expect(isAllowedSenderUrl(nested, fileOrigin)).toBe(true)
    expect(isAllowedSenderUrl(outside, fileOrigin)).toBe(false)
    expect(isAllowedSenderUrl(sibling, fileOrigin)).toBe(false)
    expect(isAllowedSenderUrl(inside, packaged)).toBe(false)
  })

  test('electron.security.ipcOrigins adds origins explicitly', () => {
    const policy = createSenderPolicy({
      appOrigin: 'app://local',
      extraOrigins: ['https://trusted.example.com'],
    })
    expect(isAllowedSenderUrl('https://trusted.example.com/page', policy)).toBe(true)
    expect(isAllowedSenderUrl('https://example.com/page', policy)).toBe(false)
  })
})

// The same check, through the IPC module that main.ts and the runtime register every listener with
class FakeIpcMain extends EventEmitter {
  handlers = new Map<string, (...args: any[]) => any>()
  handle(channel: string, fn: (...args: any[]) => any) {
    this.handlers.set(channel, fn)
  }
  removeHandler(channel: string) {
    this.handlers.delete(channel)
  }
  invoke(channel: string, event: any, ...args: any[]) {
    return this.handlers.get(channel)!(event, ...args)
  }
}

describe('IPC sender validation: every registered handler applies it', () => {
  let ipcMain: FakeIpcMain
  const allowed = () => eventFrom(frame('app://local/index.html'))
  const foreign = () => eventFrom(frame('https://example.com/'))
  const foreignSubframe = () =>
    eventFrom(frame('https://example.com/embed', frame('app://local/index.html')))

  beforeEach(() => {
    ipcMain = new FakeIpcMain()
    IPC.setIPCBackend(ipcMain, () => [])
    IPC.setSenderPolicy(packaged)
  })

  test('on(): an app page reaches the listener; a foreign frame and a foreign subframe do not', () => {
    const calls: any[] = []
    IPC.on('commoners:close', (_e, id) => calls.push(id))
    ipcMain.emit('commoners:close', allowed(), 1)
    ipcMain.emit('commoners:close', foreign(), 2)
    ipcMain.emit('commoners:close', foreignSubframe(), 3)
    expect(calls).toEqual([1])
  })

  test('on(): a rejected synchronous message gets a null return value, so the sender does not hang', () => {
    IPC.on('commoners:location', ev => (ev.returnValue = { search: '?secret' }))
    const ev = foreign()
    ipcMain.emit('commoners:location', ev, 1)
    expect(ev.returnValue).toBeNull()
  })

  test('once(): a rejected message does not use up the listener', () => {
    const calls: any[] = []
    IPC.once('commoners:quit', (_e, msg) => calls.push(msg))
    ipcMain.emit('commoners:quit', foreign(), 'foreign')
    ipcMain.emit('commoners:quit', allowed(), 'app')
    ipcMain.emit('commoners:quit', allowed(), 'again')
    expect(calls).toEqual(['app'])
  })

  test('removeListener() removes a listener registered through on()', () => {
    const calls: any[] = []
    const listener = (_e: any, id: number) => calls.push(id)
    IPC.on('commoners:close', listener)
    IPC.removeListener('commoners:close', listener)
    ipcMain.emit('commoners:close', allowed(), 1)
    expect(calls).toEqual([])
    expect(ipcMain.listenerCount('commoners:close')).toBe(0)
  })

  test('scopedOn(): plugin and service listeners check the sender', () => {
    const calls: any[] = []
    IPC.pluginOn('demo', 'log', (_e, msg) => calls.push(msg))
    ipcMain.emit('plugins:demo:log', allowed(), 'app')
    ipcMain.emit('plugins:demo:log', foreign(), 'foreign')
    ipcMain.emit('plugins:demo:log', foreignSubframe(), 'subframe')
    expect(calls).toEqual(['app'])
  })

  test('scopedHandle(): an invoke from a foreign frame or subframe rejects; an app page gets the result', async () => {
    IPC.pluginHandle('demo', 'secret', () => 'value')
    expect(await ipcMain.invoke('plugins:demo:secret', allowed())).toBe('value')
    expect(() => ipcMain.invoke('plugins:demo:secret', foreign())).toThrow(/Rejected/)
    expect(() => ipcMain.invoke('plugins:demo:secret', foreignSubframe())).toThrow(/Rejected/)
  })

  test('with no sender policy set, nothing gets through', () => {
    IPC.setSenderPolicy(null)
    const calls: any[] = []
    IPC.on('commoners:close', (_e, id) => calls.push(id))
    ipcMain.emit('commoners:close', allowed(), 1)
    expect(calls).toEqual([])
  })
})
