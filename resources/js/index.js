import { position, normalize, navigate, typeahead, shortcut, longPress, safeTriangle, selectedLabel } from './core/menu.js'

let installed = false
let cache = new WeakMap()
let settledRows = new WeakMap()
let active = null
let lastRow = null
let touch = null
let suppressClick = 0
const rtl = () => document.documentElement.dir === 'rtl'
const point = event => ({ x: event.clientX, y: event.clientY })
const el = (tag, className, text) => {
    const node = document.createElement(tag)
    node.className = className
    if (text != null) node.textContent = text
    return node
}

function targetFor(target) {
    if (!(target instanceof Element)) return null
    const row = target.closest('[wire\\:key*=".table.records."]')
    const key = row?.getAttribute('wire:key')?.match(/\.table\.records\.(.+)$/)?.[1]
    const table = key ? row.closest('.fi-ta') : null
    const marker = table?.querySelector('[data-warp-context-menu-config]')
    const pageMarker = target.closest('[wire\\:id]')?.querySelector('[data-warp-context-menu-kind="page"]')
    const selected = marker ?? (!target.closest('.fi-ta') && pageMarker?.dataset.warpContextMenuConfig && JSON.parse(pageMarker.dataset.warpContextMenuConfig).kind === 'page' ? pageMarker : null)
    if (!selected) return null
    const componentEl = selected.closest('[wire\\:id]')
    const component = window.Livewire?.find(componentEl.getAttribute('wire:id'))
    if (!component) return null
    const config = JSON.parse(selected.dataset.warpContextMenuConfig)
    return { row: key ? row : null, key, table, config, component, componentEl, target }
}

function nativeMenu(event) {
    if (event.shiftKey || event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return true
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.rangeCount) return false
    return [...selection.getRangeAt(0).getClientRects()].some(rect => event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom)
}

function fetchRows(context) {
    let entry = cache.get(context.componentEl)
    if (entry) return entry
    const keys = [...context.table.querySelectorAll('[wire\\:key]')].map(row => row.getAttribute('wire:key').match(/\.table\.records\.(.+)$/)?.[1]).filter(Boolean).slice(0, 100)
    entry = context.component.$call('__warpContextMenu', keys, 'record').then(rows => { settledRows.set(context.componentEl, rows); return rows }).catch(() => { cache.delete(context.componentEl); return {} })
    cache.set(context.componentEl, entry)
    return entry
}

function isKnownEmpty(context) {
    if (!context.row) return false
    const scope = window.Alpine.$data(context.table)
    if (context.config.bulk && scope.getSelectedRecordsCount?.() >= 2 && scope.isRecordSelected(context.key)) return false
    const row = settledRows.get(context.componentEl)?.[context.key]
    if (!row) return false
    const column = context.target.closest('[data-warp-context-menu-column]')?.dataset.warpContextMenuColumn
    return !(row.items?.length || row.cells?.[column]?.length
        || (context.config.copyCell && context.target.closest('td, .fi-ta-col'))
        || (context.config.links && context.target.closest('a[href]')))
}

function close(restore = false) {
    if (!active) return
    const previous = active
    active = null
    previous.menu.remove()
    previous.context.row?.removeAttribute('data-warp-context-menu-open')
    if (restore && previous.focus?.isConnected) previous.focus.focus({ preventScroll: true })
}

function place(menu, anchor, submenu = false) {
    const rect = menu.getBoundingClientRect()
    const pos = position(anchor, rect, { width: innerWidth, height: innerHeight }, rtl(), submenu)
    if (innerWidth >= 640 || submenu) {
        menu.style.left = `${pos.x}px`
        menu.style.top = `${pos.y}px`
    }
    menu.style.maxHeight = `${pos.maxHeight}px`
}

async function copy(value, state) {
    try {
        await navigator.clipboard.writeText(value)
        announce(state.context.config.messages.copied)
    } catch {
        announce(state.context.config.messages.copy_failed)
    }
}

function announce(message) {
    let region = document.getElementById('warp-context-menu-status')
    if (!region) {
        region = el('div', 'fi-wcm-sr')
        region.id = 'warp-context-menu-status'
        region.setAttribute('role', 'status')
        document.body.append(region)
    }
    region.textContent = ''
    requestAnimationFrame(() => { region.textContent = message })
}

function activate(item, state) {
    if (item.disabled) return
    if (item.run) item.run()
    else if (item.url) {
        // Match browser navigation while refusing executable URL schemes.
        const url = new URL(item.url, location.href)
        if (['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) {
            if (item.newTab) window.open(url.href, '_blank', 'noopener,noreferrer')
            else location.assign(url.href)
        }
    } else if (state.kind === 'bulk') {
        window.Alpine.$data(state.context.table).mountAction(item.name, item.arguments ?? {}, { ...item.context, table: true, bulk: true })
    } else {
        state.context.component.$call('mountAction', item.name, item.arguments ?? {}, state.kind === 'page' ? item.context ?? {} : { ...item.context, table: true, recordKey: state.context.key })
    }
    close(true)
}

function renderItems(menu, items, state, parentButton = null) {
    const buttons = []
    let submenu = null
    let submenuButton = null
    let hoverOrigin = null
    let submenuTimer = null
    const closeSubmenu = () => { submenu?.remove(); submenu = null; submenuButton?.setAttribute('aria-expanded', 'false'); submenuButton = null }
    const openSubmenu = (item, button) => {
        closeSubmenu()
        submenu = el('div', 'fi-wcm fi-wcm-submenu')
        submenu.setAttribute('role', 'menu')
        submenu.setAttribute('aria-label', item.label)
        menu.append(submenu)
        submenuButton = button
        submenu.addEventListener('pointerenter', () => clearTimeout(submenuTimer))
        const rect = button.getBoundingClientRect()
        renderItems(submenu, item.items, state, button)
        place(submenu, { x: rtl() ? rect.left : rect.right, y: rect.top, left: rect.left, right: rect.right }, true)
        button.setAttribute('aria-expanded', 'true')
        return submenu
    }
    for (const item of items) {
        if (item.type === 'separator') {
            const line = el('div', 'fi-wcm-separator'); line.setAttribute('role', 'separator'); menu.append(line); continue
        }
        if (item.type === 'section') {
            const group = el('div', 'fi-wcm-section')
            group.setAttribute('role', 'group'); group.setAttribute('aria-label', item.label ?? '')
            if (item.label) group.append(el('div', 'fi-wcm-heading', item.label))
            renderItems(group, item.items, state, parentButton)
            menu.append(group); continue
        }
        const button = el('button', 'fi-wcm-item fi-dropdown-list-item')
        button.type = 'button'; button.tabIndex = -1
        button.setAttribute('aria-label', item.label ?? '')
        button.setAttribute('role', item.checkable ? 'menuitemcheckbox' : 'menuitem')
        if (item.checkable) button.setAttribute('aria-checked', String(item.checked))
        button.setAttribute('aria-disabled', String(!!item.disabled))
        button.disabled = !!item.disabled
        if (item.tooltip) button.title = item.tooltip
        const color = typeof item.color === 'string' ? item.color : null
        if (color && /^[a-z]+$/.test(color)) button.dataset.color = color
        if (item.color && typeof item.color === 'object') {
            for (const shade of [400, 600]) {
                const value = item.color[shade]
                if (typeof value === 'string' && CSS.supports('color', value)) button.style.setProperty(`--wcm-color-${shade}`, value)
            }
            button.dataset.customColor = 'true'
        }
        const icon = el('span', 'fi-wcm-icon', item.checked ? '✓' : '')
        // Only SVG generated by Filament on the server enters this HTML sink.
        if (!item.checked && item.icon) icon.innerHTML = item.icon
        button.append(icon, el('span', 'fi-wcm-label', item.label))
        if (item.badge) button.append(el('span', 'fi-wcm-badge fi-badge', item.badge))
        if (item.shortcut) button.append(el('kbd', 'fi-wcm-shortcut', shortcut(item.shortcut, /Mac|iPhone|iPad/.test(navigator.platform))))
        if (item.type === 'submenu') {
            button.setAttribute('aria-haspopup', 'menu'); button.setAttribute('aria-expanded', 'false')
            button.append(el('span', 'fi-wcm-chevron', rtl() ? '‹' : '›'))
            button.addEventListener('click', () => openSubmenu(item, button).querySelector('button:not(:disabled)')?.focus())
            button.addEventListener('pointerenter', event => {
                clearTimeout(submenuTimer)
                if (event.pointerType !== 'touch') { hoverOrigin = point(event); openSubmenu(item, button) }
            })
        } else button.addEventListener('click', () => activate(item, state))
        button.addEventListener('pointerenter', event => {
            if (item.disabled || event.pointerType === 'touch') return
            if (submenu && hoverOrigin) {
                const r = submenu.getBoundingClientRect(), edge = rtl() ? r.right : r.left
                if (safeTriangle(point(event), hoverOrigin, { x: edge, y: r.top }, { x: edge, y: r.bottom })) {
                    clearTimeout(submenuTimer); submenuTimer = setTimeout(closeSubmenu, 300); return
                }
            }
            button.focus({ preventScroll: true })
            if (item.type !== 'submenu') closeSubmenu()
        })
        buttons.push({ button, item }); menu.append(button)
    }
    if (menu.getAttribute('role') !== 'menu') return
    let buffer = '', typedAt = 0
    menu.addEventListener('keydown', event => {
        if (event.target.closest('[role="menu"]') !== menu.closest('[role="menu"]')) return
        const all = [...menu.querySelectorAll('button')].filter(button => !button.closest('.fi-wcm-submenu') || button.closest('.fi-wcm-submenu') === menu)
        const index = all.indexOf(document.activeElement)
        const options = all.map(button => ({ type: button.getAttribute('aria-haspopup') ? 'submenu' : 'item', label: button.querySelector('.fi-wcm-label')?.textContent, disabled: button.disabled }))
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault(); event.stopPropagation(); all[navigate(options, index, event.key)]?.focus(); return
        }
        const forward = rtl() ? 'ArrowLeft' : 'ArrowRight', back = rtl() ? 'ArrowRight' : 'ArrowLeft'
        if (event.key === forward) {
            const selected = buttons.find(({ button }) => button === document.activeElement)
            if (selected?.item.type === 'submenu') { event.preventDefault(); event.stopPropagation(); openSubmenu(selected.item, selected.button).querySelector('button:not(:disabled)')?.focus() }
        } else if ((event.key === back || event.key === 'Escape') && parentButton) {
            event.preventDefault(); event.stopPropagation(); menu.remove(); parentButton.setAttribute('aria-expanded', 'false'); parentButton.focus()
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.key !== ' ') {
            buffer = Date.now() - typedAt > 700 ? event.key : buffer + event.key; typedAt = Date.now()
            const query = [...buffer].every(char => char === buffer[0]) ? buffer[0] : buffer
            all[typeahead(options, query, index)]?.focus(); event.preventDefault(); event.stopPropagation()
        }
    })
}

async function open(context, anchor, keyboard = false) {
    close()
    const scope = context.table ? window.Alpine.$data(context.table) : null
    const bulk = context.config.bulk && scope?.getSelectedRecordsCount?.() >= 2 && scope.isRecordSelected(context.key)
    const kind = bulk ? 'bulk' : context.config.kind
    const menu = el('div', 'fi-wcm')
    menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', context.config.messages[`label_${kind}`])
    const state = { context, menu, kind, focus: document.activeElement }
    active = state
    context.row?.setAttribute('data-warp-context-menu-open', '')
    menu.append(el('div', 'fi-wcm-heading', context.config.messages.loading)); document.body.append(menu); place(menu, anchor)
    let items
    if (kind === 'record') {
        const rows = await fetchRows(context)
        const row = rows[context.key] ?? (await context.component.$call('__warpContextMenu', [context.key], 'record').catch(() => ({})))[context.key]
        const column = context.target.closest('[data-warp-context-menu-column]')?.dataset.warpContextMenuColumn
        items = [...(row?.cells?.[column] ?? []), ...(row?.items ?? [])]
        const cell = context.target.closest('td, .fi-ta-col')
        if (cell && context.config.copyCell) items.push({ type: 'separator' }, { type: 'item', label: context.config.messages.copy_cell, run: () => copy(cell.innerText.trim(), state) })
        const link = context.target.closest('a[href]')
        if (link && context.config.links) items.push({ type: 'separator' }, { type: 'item', label: context.config.messages.open_link_new_tab, url: link.href, newTab: true }, { type: 'item', label: context.config.messages.copy_link, run: () => copy(link.href, state) })
    } else {
        items = await context.component.$call('__warpContextMenu', [], kind).catch(() => [])
    }
    if (active !== state) return
    menu.replaceChildren()
    items = normalize(items)
    if (!items.length) { close(true); return }
    if (bulk) menu.append(el('div', 'fi-wcm-heading', selectedLabel(context.config.messages.selected, scope.getSelectedRecordsCount())))
    renderItems(menu, items, state)
    place(menu, anchor)
    if (keyboard) menu.querySelector('button:not(:disabled)')?.focus()
}

function bootstrap(marker) {
    const config = JSON.parse(marker.dataset.warpContextMenuConfig)
    if (!document.getElementById('warp-context-menu-css')) {
        const link = document.createElement('link'); link.id = 'warp-context-menu-css'; link.rel = 'stylesheet'; link.href = config.css; document.head.append(link)
    }
    if (installed) return
    installed = true
    document.addEventListener('contextmenu', event => {
        if (nativeMenu(event)) return
        const context = targetFor(event.target)
        if (!context || isKnownEmpty(context)) return
        event.preventDefault(); open(context, point(event))
    })
    document.addEventListener('pointerover', event => {
        const context = targetFor(event.target) ?? targetFor(event.target.closest?.('.fi-ta')?.querySelector('[wire\\:key*=".table.records."]'))
        if (!context?.table) return
        lastRow = context.row
        fetchRows(context)
    }, { passive: true })
    document.addEventListener('keydown', event => {
        if (active && event.key === 'Escape') { event.preventDefault(); close(true); return }
        if (active && event.key === 'Tab') { close(); return }
        if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
        if (event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return
        const focused = targetFor(event.target)
        const context = focused?.row ? focused : targetFor(lastRow) ?? focused
        if (!context) return
        event.preventDefault()
        const r = (context.row ?? event.target).getBoundingClientRect()
        open(context, { x: r.left + 16, y: r.top + 16 }, true)
    })
    document.addEventListener('pointerdown', event => {
        if (active && !active.menu.contains(event.target)) close()
        if (event.pointerType !== 'touch' || nativeMenu(event)) return
        const context = targetFor(event.target)
        if (!context) return
        const start = point(event), started = Date.now()
        touch = { start, current: start, timer: setTimeout(() => {
            if (touch && longPress(start, touch.current, Date.now() - started)) { suppressClick = Date.now() + 1000; open(context, start) }
        }, 500) }
    }, { passive: true })
    const cancelTouch = () => { clearTimeout(touch?.timer); touch = null }
    document.addEventListener('pointermove', event => {
        if (!touch) return
        touch.current = point(event)
        if (Math.hypot(touch.current.x - touch.start.x, touch.current.y - touch.start.y) > 10) cancelTouch()
    }, { passive: true })
    document.addEventListener('pointerup', cancelTouch, { passive: true })
    document.addEventListener('pointercancel', cancelTouch, { passive: true })
    document.addEventListener('click', event => { if (suppressClick > Date.now()) { suppressClick = 0; event.preventDefault(); event.stopImmediatePropagation(); return } if (active && !active.menu.contains(event.target)) close() }, true)
    document.addEventListener('scroll', event => { cancelTouch(); if (active && !active.menu.contains(event.target)) close() }, true)
    window.addEventListener('resize', () => close())
    document.addEventListener('livewire:navigated', () => { close(); cancelTouch(); cache = new WeakMap(); settledRows = new WeakMap(); lastRow = null })
    window.Livewire.hook('morph.updating', ({ component }) => { cache.delete(component.el); settledRows.delete(component.el); if (active?.context.componentEl === component.el) close() })
}

export default function warpContextMenu() {
    return { init() { bootstrap(this.$el) } }
}
