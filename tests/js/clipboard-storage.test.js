// @vitest-environment happy-dom
import { beforeEach, afterEach, it, expect, vi } from 'vitest'

let clipboard, listeners, nativeWrite
const key = 'warp-contextmenu:test-security'
const recentKey = `${key}:recent`
function configure(persist = true, identity = key) {
    document.querySelector('[data-warp-context-menu-config]').dataset.warpContextMenuConfig = JSON.stringify({ clipboard: { enabled: true, key: identity, limit: 10, persist } })
}
beforeEach(async () => {
    vi.resetModules()
    localStorage.clear(); sessionStorage.clear()
    document.body.innerHTML = '<div data-warp-context-menu-config></div><input id="ordinary">'
    configure()
    nativeWrite = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: nativeWrite } })
    listeners = vi.spyOn(document, 'addEventListener')
    clipboard = await import('../../resources/js/clipboard.js')
    clipboard.installClipboard()
})
afterEach(() => {
    for (const args of listeners.mock.calls) document.removeEventListener(...args)
    vi.restoreAllMocks()
})

it('stores recent copies only in the tab and persists only explicit kept or added text', () => {
    clipboard.capture('recent'); clipboard.capture('keep me'); clipboard.keep('keep me', true); clipboard.save('manual', 'Template')
    expect(JSON.parse(localStorage.getItem(key)).map(item => item.value)).toEqual(['manual', 'keep me'])
    expect(JSON.parse(sessionStorage.getItem(recentKey)).map(item => item.value)).toEqual(['recent'])
    sessionStorage.clear()
    expect(clipboard.entries().map(item => item.value)).toEqual(['manual', 'keep me'])
    clipboard.keep('keep me', false)
    expect(JSON.parse(localStorage.getItem(key)).map(item => item.value)).toEqual(['manual'])
    expect(JSON.parse(sessionStorage.getItem(recentKey)).map(item => item.value)).toEqual(['keep me'])
})
it('keeps both lists in the tab when persistence is disabled and isolates identities', () => {
    configure(false)
    clipboard.capture('temporary'); clipboard.save('temporary kept', 'Name')
    expect(localStorage.getItem(key)).toBeNull()
    expect(clipboard.entries().map(item => item.value)).toEqual(['temporary kept', 'temporary'])
    configure(false, 'another-tenant')
    expect(clipboard.entries()).toEqual([])
    configure(false)
    expect(clipboard.entries()).toHaveLength(2)
    sessionStorage.clear()
    expect(clipboard.entries()).toEqual([])
})
it('preserves kept text on logout and restores it for the same identity', () => {
    clipboard.capture('recent'); clipboard.save('kept', 'Name')
    const form = document.createElement('form'); form.action = `${location.origin}/logout`; document.body.append(form)
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    expect(JSON.parse(localStorage.getItem(key))[0].value).toBe('kept')
    configure(true, 'another-user'); expect(clipboard.entries()).toEqual([])
    configure(); expect(clipboard.entries().some(item => item.value === 'kept')).toBe(true)
})
it('ignores oversized copies while accepting the exact 5000 character boundary', async () => {
    const input = document.querySelector('#ordinary'); input.focus()
    await navigator.clipboard.writeText('x'.repeat(5001))
    expect(clipboard.entries()).toEqual([])
    await navigator.clipboard.writeText('x'.repeat(5000))
    expect(clipboard.entries()[0].value).toHaveLength(5000)
    expect(nativeWrite).toHaveBeenCalledTimes(2)
    clipboard.save('saved', 'Template')
    clipboard.save('x'.repeat(5001), 'Too long', 'saved')
    expect(clipboard.entries()[0].value).toBe('saved')
})
it('captures ordinary native and programmatic copies but excludes secrets even after reveal', async () => {
    const input = document.querySelector('#ordinary'); input.value = 'ordinary'; input.focus(); input.select()
    input.dispatchEvent(new Event('copy', { bubbles: true }))
    expect(clipboard.entries()[0].value).toBe('ordinary')
    input.type = 'password'; input.value = 'secret'; input.select()
    input.dispatchEvent(new Event('copy', { bubbles: true }))
    await navigator.clipboard.writeText('secret')
    input.type = 'text'; input.setAttribute('x-bind:type', "isPasswordRevealed ? 'text' : 'password'"); input.select()
    input.dispatchEvent(new Event('copy', { bubbles: true }))
    await navigator.clipboard.writeText('revealed secret')
    expect(clipboard.entries().map(item => item.value)).toEqual(['ordinary'])
    expect(nativeWrite).toHaveBeenCalledTimes(2)
})
it('excludes autocomplete credentials and opt-out ancestors for native copy and writeText', async () => {
    const input = document.querySelector('#ordinary'); input.focus(); input.value = 'otp'; input.select()
    input.autocomplete = 'one-time-code'; input.dispatchEvent(new Event('copy', { bubbles: true })); await navigator.clipboard.writeText('otp')
    input.autocomplete = 'new-password'; await navigator.clipboard.writeText('new password')
    input.autocomplete = 'current-password'; await navigator.clipboard.writeText('current password')
    input.removeAttribute('autocomplete')
    const region = document.createElement('div'); region.setAttribute('data-warp-no-clipboard', ''); document.body.append(region); region.append(input); input.focus()
    input.dispatchEvent(new Event('copy', { bubbles: true })); await navigator.clipboard.writeText('private region')
    document.querySelector('[data-warp-context-menu-config]').dispatchEvent(new Event('copy', { bubbles: true }))
    expect(clipboard.entries()).toEqual([])
    expect(nativeWrite).toHaveBeenCalledTimes(4)
})
