import * as history from './core/clipboard.js'

let current = null
let installed = false
let lastPointerTarget = null
const settings = () => {
    const markers = [...document.querySelectorAll('[data-warp-context-menu-config]')]
    return markers.map(marker => JSON.parse(marker.dataset.warpContextMenuConfig)).find(config => config.clipboard?.enabled && typeof config.clipboard.key === 'string')?.clipboard
}
export function clipboardSettings() { return settings() }
export function entries() {
    const config = settings()
    if (!config) { current = null; return [] }
    // Recent copies never survive closing a tab; only explicitly kept text persists.
    current = { key: config.key, storage: config.persist ? localStorage : sessionStorage, config }
    const read = (storage, key) => {
        try {
            const data = JSON.parse(storage.getItem(key) ?? '[]')
            return Array.isArray(data) ? data.filter(item => item && typeof item === 'object') : []
        } catch { return [] }
    }
    return history.limitItems([
        ...read(current.storage, config.key).filter(item => item.kept),
        ...read(sessionStorage, `${config.key}:recent`).filter(item => !item.kept),
    ], config.limit)
}
function update(transform) {
    const items = entries()
    if (!current) return
    const next = transform(items, current.config.limit)
    try { current.storage.setItem(current.key, JSON.stringify(next.filter(item => item.kept))) } catch { /* Storage may be unavailable. */ }
    try { sessionStorage.setItem(`${current.key}:recent`, JSON.stringify(next.filter(item => !item.kept))) } catch { /* Storage may be unavailable. */ }
}
export function excluded(target) {
    if (!(target instanceof Element)) return false
    if (target.closest('[data-warp-no-clipboard]')) return true
    const field = target.closest('input, textarea')
    if (!field) return false
    if (field.matches('input[type=password]')) return true
    if ((field.getAttribute('autocomplete') ?? '').toLowerCase().split(/\s+/).some(token => ['one-time-code', 'new-password', 'current-password'].includes(token))) return true
    return [...field.attributes].some(attribute => (attribute.name === ':type' || attribute.name.startsWith('x-bind:type')) && /password/i.test(attribute.value))
}
export function capture(value, source = document.title, target = document.activeElement) {
    if (excluded(target) || excluded(document.activeElement)) return
    update((items, limit) => history.add(items, { value, source, time: Date.now() }, limit))
}
export const keep = (value, kept) => update((items, limit) => history.keep(items, value, kept, limit))
export const remove = value => update(items => history.remove(items, value))
export const clear = () => update(history.clear)
export function save(value, name, previous = null) {
    update((items, limit) => previous === null
        ? history.add(items, { value, name, kept: true, addedByUser: true, source: null, time: Date.now() }, limit)
        : history.edit(items, previous, { value, name, kept: true, time: Date.now() }, limit))
}
export const inputTarget = target => target instanceof Element && target.matches('textarea, input:not([type]), input[type=text], input[type=email], input[type=search], input[type=url], input[type=tel], input[type=number]') && !excluded(target) && !target.disabled && !target.readOnly && !target.closest('.fi-warp-contextmenu-menu')
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
    document.addEventListener('copy', event => {
        if (excluded(document.activeElement) || excluded(event.target)) return
        const target = event.target
        const selected = inputTarget(target) ? target.value.slice(target.selectionStart ?? 0, target.selectionEnd ?? 0) : window.getSelection()?.toString()
        capture(selected ?? '', sourceFor(target), target)
    })
    if (navigator.clipboard?.writeText) {
        const original = navigator.clipboard.writeText.bind(navigator.clipboard)
        try {
            navigator.clipboard.writeText = async value => {
                const blocked = excluded(document.activeElement), source = sourceFor(lastPointerTarget?.isConnected ? lastPointerTarget : document.activeElement)
                await original(value)
                if (!blocked) capture(value, source)
            }
        } catch { /* Explicit plugin copies and native copy events still work. */ }
    }
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
