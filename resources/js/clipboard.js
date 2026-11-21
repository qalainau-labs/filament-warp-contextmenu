import * as history from './core/clipboard.js'

let current = null
let installed = false
let lastPointerTarget = null
const settings = () => {
    const markers = [...document.querySelectorAll('[data-warp-context-menu-config]')]
    return markers.map(marker => JSON.parse(marker.dataset.warpContextMenuConfig)).find(config => config.clipboard?.enabled)?.clipboard
}
export function clipboardSettings() { return settings() }
export function entries() {
    const config = settings()
    if (!config) { current = null; return [] }
    const storage = config.persist ? localStorage : sessionStorage
    // Never reuse an in-memory list across identities or panel navigation.
    current = { key: config.key, storage, config }
    try {
        const data = JSON.parse(storage.getItem(config.key) ?? '[]')
        return history.limitItems(Array.isArray(data) ? data.filter(item => item && typeof item === 'object') : [], config.limit)
    } catch { return [] }
}
function update(transform) {
    const items = entries()
    if (!current) return
    try { current.storage.setItem(current.key, JSON.stringify(transform(items, current.config.limit))) } catch { /* Storage may be unavailable. */ }
}
export function capture(value, source = document.title) {
    update((items, limit) => history.add(items, { value, source, time: Date.now() }, limit))
}
export const keep = (value, kept) => update((items, limit) => history.keep(items, value, kept, limit))
export const remove = value => update(items => history.remove(items, value))
export const clear = () => update(history.clear)
export function save(value, name, previous = null) {
    update((items, limit) => previous === null
        ? history.add(items, { value, name, kept: true, source: document.title, time: Date.now() }, limit)
        : history.edit(items, previous, { value, name, kept: true, time: Date.now() }, limit))
}
export const inputTarget = target => target instanceof Element && target.matches('textarea, input:not([type]), input[type=text], input[type=email], input[type=search], input[type=url], input[type=tel], input[type=number]') && !target.disabled && !target.readOnly && !target.closest('.fi-wcm')
export function paste(target, value, selection) {
    const start = selection?.[0] ?? target.selectionStart ?? target.value.length
    const end = selection?.[1] ?? target.selectionEnd ?? start
    const next = target.value.slice(0, start) + value + target.value.slice(end)
    const prototype = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(target, next)
    target.focus()
    try { target.setSelectionRange(start + value.length, start + value.length) } catch { /* Number inputs have no selection API. */ }
    target.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
}
export function sourceFor(target) {
    const row = target?.closest?.('.fi-ta-row')
    const heading = row?.querySelector('.fi-ta-text')?.textContent?.trim()
    const cell = target?.closest?.('td')
    const column = cell?.closest('table')?.querySelectorAll('thead th')[cell.cellIndex]?.textContent?.trim()
        || target?.closest?.('[data-warp-context-menu-column]')?.dataset.warpContextMenuColumn
    return [heading, column].filter(Boolean).join(' · ') || document.title
}
export function installClipboard() {
    if (installed) return
    installed = true
    document.addEventListener('pointerdown', event => { lastPointerTarget = event.target }, true)
    const password = () => document.activeElement?.matches('input[type=password]')
    document.addEventListener('copy', event => {
        if (password() || event.target?.closest?.('input[type=password]')) return
        const target = event.target
        const selected = inputTarget(target) ? target.value.slice(target.selectionStart ?? 0, target.selectionEnd ?? 0) : window.getSelection()?.toString()
        capture(selected ?? '', sourceFor(target))
    })
    if (navigator.clipboard?.writeText) {
        const original = navigator.clipboard.writeText.bind(navigator.clipboard)
        try {
            navigator.clipboard.writeText = async value => {
                const blocked = password(), source = sourceFor(lastPointerTarget?.isConnected ? lastPointerTarget : document.activeElement)
                await original(value)
                if (!blocked) capture(value, source)
            }
        } catch { /* Explicit plugin copies and native copy events still work. */ }
    }
    document.addEventListener('submit', event => {
        if (!(event.target instanceof HTMLFormElement)) return
        try {
            const url = new URL(event.target.action, location.href)
            if (url.origin !== location.origin || !/\/logout\/?$/.test(url.pathname)) return
            entries()
            if (current) { localStorage.removeItem(current.key); sessionStorage.removeItem(current.key); current = null }
        } catch { /* Ignore unrelated forms. */ }
    }, true)
}

// Mirror typography and scrolling to anchor the keyboard picker at the text caret.
export function caretPoint(target) {
    const rect = target.getBoundingClientRect(), style = getComputedStyle(target)
    const mirror = document.createElement('div')
    for (const key of ['font', 'letterSpacing', 'lineHeight', 'padding', 'border', 'boxSizing', 'direction', 'textAlign']) mirror.style[key] = style[key]
    Object.assign(mirror.style, { position: 'fixed', visibility: 'hidden', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, whiteSpace: target instanceof HTMLTextAreaElement ? 'pre-wrap' : 'pre', overflowWrap: 'break-word' })
    mirror.textContent = target.value.slice(0, target.selectionStart ?? target.value.length)
    const caret = document.createElement('span'); caret.textContent = '\u200b'; mirror.append(caret); document.body.append(mirror)
    const point = caret.getBoundingClientRect()
    const result = { x: Math.max(rect.left, Math.min(rect.right, point.left - target.scrollLeft)), y: Math.max(rect.top, Math.min(rect.bottom, point.bottom - target.scrollTop)) }
    mirror.remove()
    return result
}

export function relativeTime(time, locale = document.documentElement.lang, now = Date.now()) {
    if (!Number.isFinite(time)) return ''
    const seconds = (time - now) / 1000
    const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]]
    const [unit, size] = units.find(([, size]) => Math.abs(seconds) >= size) ?? units.at(-1)
    let formatter
    try { formatter = new Intl.RelativeTimeFormat(locale?.replaceAll('_', '-') || undefined, { numeric: 'auto' }) }
    catch { formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' }) }
    return formatter.format(Math.round(seconds / size), unit)
}
