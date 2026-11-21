import { search, shouldShowSearch } from './core/search.js'
import { shouldCloseOnScroll } from './core/scroll.js'
import { safeUrl } from './core/url.js'
import * as clipboard from './clipboard.js'
import { position, normalize, navigate, shortcut, longPress, safeTriangle, selectedLabel } from './core/menu.js'

let installed = false
let cache = new WeakMap()
let settledRows = new WeakMap()
let active = null
let lastRow = null
let touch = null
let suppressClick = 0
const mobile = () => innerWidth < 640
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

const scrollPosition = target => target === document
    ? { x: window.scrollX, y: window.scrollY }
    : { x: target.scrollLeft, y: target.scrollTop }

function openingScroll(target) {
    const positions = new Map([[document, scrollPosition(document)]])
    for (let node = target; node instanceof Element; node = node.parentElement) positions.set(node, scrollPosition(node))
    return positions
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
        || (context.config.links && context.target.closest('a[href]')) || (context.config.clipboardMenu !== false && context.config.clipboard?.enabled))
}

function close(restore = false) {
    if (!active) return
    const previous = active
    active = null
    previous.menu.remove()
    previous.context.row?.removeAttribute('data-warp-context-menu-open')
    previous.context.row?.classList.remove('fi-warp-contextmenu-open-row')
    if (restore && previous.focus?.isConnected) previous.focus.focus({ preventScroll: true })
}

function place(menu, anchor, submenu = false) {
    if (mobile()) { menu.style.maxHeight = `${innerHeight - 16}px`; return }
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
        clipboard.capture(value, clipboard.sourceFor(state.context.target))
        announce(state.context.config.messages.copied)
    } catch {
        announce(state.context.config.messages.copy_failed)
    }
}

function announce(message) {
    let region = document.getElementById('warp-context-menu-status')
    if (!region) {
        region = el('div', 'fi-warp-contextmenu-menu-sr')
        region.id = 'warp-context-menu-status'
        region.setAttribute('role', 'status')
        document.body.append(region)
    }
    region.textContent = ''
    requestAnimationFrame(() => { region.textContent = message })
}

function activate(item, state) {
    if (item.disabled) return
    if (item.stayOpen) { item.run(); return }
    if (item.copyValue != null) copy(item.copyValue, state)
    else if (item.run) item.run()
    else if (item.url) {
        const url = safeUrl(item.url, location.href)
        if (url) {
            if (item.newTab) window.open(url, '_blank', 'noopener,noreferrer')
            else location.assign(url)
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
    const host = menu.closest('.fi-warp-contextmenu-menu')
    const closeSubmenu = () => { submenu?.remove(); host?.classList.remove('fi-warp-contextmenu-menu-has-submenu'); submenu = null; submenuButton?.setAttribute('aria-expanded', 'false'); submenuButton = null }
    const openSubmenu = (item, button) => {
        clearTimeout(submenuTimer)
        if (submenuButton === button && submenu?.isConnected) return submenu
        closeSubmenu()
        submenu = el('div', 'fi-warp-contextmenu-menu fi-warp-contextmenu-menu-submenu')
        submenu.setAttribute('role', 'menu')
        submenu.setAttribute('aria-label', item.label)
        ;(mobile() ? host : menu).append(submenu)
        submenuButton = button
        if (mobile()) {
            host.classList.add('fi-warp-contextmenu-menu-has-submenu')
            const back = el('button', 'fi-warp-contextmenu-menu-item fi-warp-contextmenu-menu-back', '‹ ' + state.context.config.messages.back)
            back.type = 'button'; back.setAttribute('role', 'menuitem')
            back.addEventListener('click', () => { closeSubmenu(); button.focus({ preventScroll: true }) })
            submenu.append(back)
        }
        submenu.addEventListener('pointerenter', () => clearTimeout(submenuTimer))
        const rect = button.getBoundingClientRect()
        renderItems(submenu, item.items, state, button)
        place(submenu, { x: rtl() ? rect.left : rect.right, y: rect.top, left: rect.left, right: rect.right }, true)
        button.setAttribute('aria-expanded', 'true')
        return submenu
    }
    for (const item of items) {
        if (item.type === 'separator') {
            const line = el('div', 'fi-warp-contextmenu-menu-separator'); line.setAttribute('role', 'separator'); menu.append(line); continue
        }
        if (item.type === 'section') {
            const group = el('div', 'fi-warp-contextmenu-menu-section')
            group.setAttribute('role', 'group'); group.setAttribute('aria-label', item.label ?? '')
            if (item.label) group.append(el('div', 'fi-warp-contextmenu-menu-heading', item.label))
            menu.append(group)
            renderItems(group, item.items, state, parentButton)
            continue
        }
        const button = el('button', 'fi-warp-contextmenu-menu-item fi-dropdown-list-item')
        button.type = 'button'; button.tabIndex = -1
        button.setAttribute('aria-label', item.label ?? '')
        button.setAttribute('role', item.checkable ? 'menuitemcheckbox' : 'menuitem')
        if (item.checkable) button.setAttribute('aria-checked', String(item.checked))
        button.setAttribute('aria-disabled', String(!!item.disabled))
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
        const icon = el('span', 'fi-warp-contextmenu-menu-icon', item.checked ? '✓' : '')
        // warp-safe-html: item.icon is only the SVG that Filament renders on the server (Menus::icon), never a user value.
        if (!item.checked && item.icon) icon.innerHTML = item.icon
        const label = el('span', 'fi-warp-contextmenu-menu-label', item.label)
        if (item.strong) { label.textContent = ''; label.append(el('strong', '', item.label)) }
        if (item.preview) label.append(el('span', 'fi-warp-contextmenu-menu-preview', item.preview.replace(/\s+/g, ' ')))
        if (item.detail) label.append(el('small', 'fi-warp-contextmenu-menu-detail', item.detail))
        if (item.disabled && item.tooltip) label.append(el('small', 'fi-warp-contextmenu-menu-detail', item.tooltip))
        if (item.path) label.append(el('small', 'fi-warp-contextmenu-menu-detail', item.path + ' › ' + item.label))
        button.append(icon, label)
        if (item.badge) button.append(el('span', 'fi-warp-contextmenu-menu-badge fi-badge', item.badge))
        if (item.shortcut) button.append(el('kbd', 'fi-warp-contextmenu-menu-shortcut', shortcut(item.shortcut, /Mac|iPhone|iPad/.test(navigator.platform))))
        if (item.type === 'submenu') {
            button.setAttribute('aria-haspopup', 'menu'); button.setAttribute('aria-expanded', 'false')
            button.append(el('span', 'fi-warp-contextmenu-menu-chevron', rtl() ? '‹' : '›'))
            button.addEventListener('click', () => openSubmenu(item, button).querySelector('button:not(:disabled)')?.focus())
            button.addEventListener('pointerenter', event => {
                clearTimeout(submenuTimer)
                if (!mobile() && event.pointerType !== 'touch') { hoverOrigin = point(event); openSubmenu(item, button) }
            })
        } else button.addEventListener('click', () => activate(item, state))
        button.addEventListener('pointerenter', event => {
            if (mobile() || event.pointerType === 'touch') return
            if (item.type === 'submenu') { button.focus({ preventScroll: true }); return }
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
    menu.onkeydown = event => {
        if (event.target.matches('input,textarea')) return
        if (event.target.closest('[role="menu"]') !== menu.closest('[role="menu"]')) return
        const all = [...menu.querySelectorAll('button')].filter(button => !button.closest('.fi-warp-contextmenu-menu-submenu') || button.closest('.fi-warp-contextmenu-menu-submenu') === menu)
        const index = all.indexOf(document.activeElement)
        const options = all.map(button => ({ type: button.getAttribute('aria-haspopup') ? 'submenu' : 'item', label: button.querySelector('.fi-warp-contextmenu-menu-label')?.textContent, disabled: false }))
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault(); event.stopPropagation(); all[navigate(options, index, event.key)]?.focus(); return
        }
        const forward = rtl() ? 'ArrowLeft' : 'ArrowRight', back = rtl() ? 'ArrowRight' : 'ArrowLeft'
        if (event.key === forward) {
            const selected = buttons.find(({ button }) => button === document.activeElement)
            if (selected?.item.type === 'submenu') { event.preventDefault(); event.stopPropagation(); openSubmenu(selected.item, selected.button).querySelector('button:not(:disabled)')?.focus() }
        } else if ((event.key === back || (event.key === 'Escape' && !state.query)) && parentButton) {
            event.preventDefault(); event.stopPropagation(); menu.parentElement?.classList.remove('fi-warp-contextmenu-menu-has-submenu'); menu.remove(); parentButton.setAttribute('aria-expanded', 'false'); parentButton.focus()

        }
    }
}

function draw(state, query = '') {
    const { menu, items, context } = state
    state.query = query
    state.editing = false
    menu.classList.remove('fi-warp-contextmenu-menu-has-submenu')
    menu.replaceChildren()
    const visible = query ? search(items, query) : items
    if (query || state.showSearch || state.pasteTarget) {
        const input = el('input', 'fi-warp-contextmenu-menu-search')
        input.type = 'search'; input.placeholder = context.config.messages.search_placeholder
        input.setAttribute('aria-label', input.placeholder); input.value = query
        input.addEventListener('input', () => {
            const value = input.value
            draw(state, value)
            const next = menu.querySelector('input')
            if (next) { next.focus(); next.setSelectionRange(value.length, value.length) }
            else menu.querySelector('button')?.focus()
        })
        input.addEventListener('keydown', event => {
            if (['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
                event.preventDefault(); event.stopPropagation()
                const buttons = [...menu.querySelectorAll('button')].filter(button => !button.closest('.fi-warp-contextmenu-menu-submenu'))
                const button = event.key === 'ArrowUp' ? buttons.at(-1) : buttons[0]
                if (event.key === 'Enter') button?.click(); else button?.focus()
            }
        })
        menu.append(input)
    }
    if (state.heading) menu.append(el('div', 'fi-warp-contextmenu-menu-heading', state.heading))
    if (!visible.length) menu.append(el('div', 'fi-warp-contextmenu-menu-heading', context.config.messages.search_empty.replace(':query', query)))
    renderItems(menu, visible, state)
    if (state.pasteTarget) menu.append(el('div', 'fi-warp-contextmenu-menu-detail', context.config.messages.clipboard_native_hint))
    place(menu, state.anchor)
}

function editor(state, entry = null) {
    state.editing = true
    state.menu.classList.remove('fi-warp-contextmenu-menu-has-submenu')
    state.menu.replaceChildren()
    state.menu.onkeydown = null
    const form = el('form', 'fi-warp-contextmenu-menu-editor')
    const nameLabel = el('label', '', state.context.config.messages.clipboard_add_name)
    const name = el('input', ''); name.value = entry?.name ?? ''; nameLabel.append(name)
    const valueLabel = el('label', '', state.context.config.messages.clipboard_add_value)
    const value = el('textarea', ''); value.value = entry?.value ?? ''; value.required = true; valueLabel.append(value)
    const submit = el('button', 'fi-btn fi-size-sm fi-color-primary', state.context.config.messages.clipboard_add_submit); submit.type = 'submit'
    const validate = () => { submit.disabled = !value.value.trim() }; validate(); value.addEventListener('input', validate)
    const cancel = el('button', 'fi-btn fi-size-sm fi-color-gray', state.context.config.messages.clipboard_add_cancel); cancel.type = 'button'
    for (const [key, button] of [['save', submit], ['cancel', cancel]]) {
        for (const [attribute, value] of Object.entries(state.context.config.clipboardButtons?.[key] ?? {})) button.setAttribute(attribute, value)
    }
    cancel.addEventListener('click', () => { draw(state); state.menu.querySelector('input,button')?.focus() })
    const actions = el('div', 'fi-warp-contextmenu-menu-editor-actions'); actions.append(submit, cancel)
    form.append(nameLabel, valueLabel, actions)
    form.addEventListener('submit', event => { event.preventDefault(); if (!value.value.trim()) return; clipboard.save(value.value, name.value, entry?.value ?? null); refreshClipboard(state) })
    state.menu.append(form); place(state.menu, state.anchor); value.focus()
}

function refreshClipboard(state) {
    if (state.pasteTarget) state.items = clipboardItems(state)
    else state.items = state.items.map(item => item.clipboardMenu ? { ...item, items: clipboardItems(state) } : item)
    draw(state)
}

function clipboardItems(state) {
    const messages = state.context.config.messages
    const action = (label, run, stayOpen = false) => ({ type: 'item', label, run, stayOpen })
    const data = clipboard.entries()
    const section = kept => ({ type: 'section', label: messages[kept ? 'clipboard_saved_section' : 'clipboard_recent_section'], items: data.filter(entry => !!entry.kept === kept).map(entry => {
        const label = entry.name || entry.value.replace(/\s+/g, ' ')
        const detail = [entry.source || document.title, clipboard.relativeTime(entry.time, state.context.config.locale ?? document.documentElement.lang)].filter(Boolean).join(' · ')
        const copyEntry = () => { if (state.pasteTarget) { clipboard.paste(state.pasteTarget, entry.value, state.selection); clipboard.capture(entry.value, entry.source) } else copy(entry.value, state) }
        if (state.pasteTarget) return { ...action(label, copyEntry), detail, strong: !!entry.name, preview: entry.name ? entry.value : null, keywords: [entry.value, entry.name ?? ''] }
        const update = run => () => { run(); refreshClipboard(state) }
        return { type: 'submenu', label, detail, strong: !!entry.name, preview: entry.name ? entry.value : null, items: [
            action(messages.copy_cell, copyEntry),
            action(messages[entry.kept ? 'clipboard_unsave' : 'clipboard_save'], update(() => clipboard.keep(entry.value, !entry.kept)), true),
            ...(entry.kept ? [action(messages.clipboard_edit, () => editor(state, entry), true)] : []),
            action(messages.clipboard_delete, update(() => clipboard.remove(entry.value)), true),
        ], keywords: [entry.value, entry.name ?? ''] }
    }) })
    return normalize([
        section(true), section(false),
        ...(!data.length ? [action(messages.clipboard_empty, () => {})] : []),
        action(messages.clipboard_clear, () => { clipboard.clear(); refreshClipboard(state) }, true),
        action('＋ ' + messages.clipboard_add, () => editor(state), true),
    ])
}

function openPaste(target, anchor, allowEmpty = false) {
    if (!clipboard.clipboardSettings() || (!allowEmpty && !clipboard.entries().length)) return false
    const marker = [...document.querySelectorAll('[data-warp-context-menu-config]')].find(marker => JSON.parse(marker.dataset.warpContextMenuConfig).clipboard?.enabled)
    if (!marker) return false
    close()
    const config = JSON.parse(marker.dataset.warpContextMenuConfig)
    const menu = el('div', 'fi-warp-contextmenu-menu'); menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', config.messages.clipboard_paste)
    const state = { menu, context: { config, target }, kind: 'clipboard', scroll: openingScroll(target), sheet: mobile(), pasteTarget: target, selection: [target.selectionStart, target.selectionEnd], focus: target, anchor }
    state.items = clipboardItems(state); active = state; document.body.append(menu); draw(state); menu.querySelector('input')?.focus()
    return true
}

async function open(context, anchor, keyboard = false) {
    close()
    const scope = context.table ? window.Alpine.$data(context.table) : null
    const bulk = context.config.bulk && scope?.getSelectedRecordsCount?.() >= 2 && scope.isRecordSelected(context.key)
    const kind = bulk ? 'bulk' : context.config.kind
    const menu = el('div', 'fi-warp-contextmenu-menu')
    menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', context.config.messages[`label_${kind}`])
    const state = { context, menu, kind, scroll: openingScroll(context.target), sheet: mobile(), focus: document.activeElement }
    active = state
    context.row?.setAttribute('data-warp-context-menu-open', '')
    context.row?.classList.add('fi-warp-contextmenu-open-row')
    menu.append(el('div', 'fi-warp-contextmenu-menu-heading', context.config.messages.loading)); document.body.append(menu); place(menu, anchor)
    let items
    const copies = [], links = []
    if (kind === 'record') {
        const rows = await fetchRows(context)
        const row = rows[context.key] ?? (await context.component.$call('__warpContextMenu', [context.key], 'record').catch(() => ({})))[context.key]
        const column = context.target.closest('[data-warp-context-menu-column]')?.dataset.warpContextMenuColumn
        items = [...(row?.cells?.[column] ?? []), ...(row?.items ?? [])]
        const cell = context.target.closest('td, .fi-ta-col')
        if (cell && context.config.copyCell) copies.push( { type: 'item', label: context.config.messages.copy_cell, run: () => copy(cell.innerText.trim(), state) })
        const link = context.target.closest('a[href]')
        if (link && context.config.links) links.push( { type: 'item', label: context.config.messages.open_link_new_tab, url: link.href, newTab: true }, { type: 'item', label: context.config.messages.copy_link, run: () => copy(link.href, state) })
    } else {
        items = await context.component.$call('__warpContextMenu', [], kind).catch(() => [])
    }
    if (active !== state) return
    menu.replaceChildren()
    items = normalize(items)
    state.showSearch = shouldShowSearch(items)
    if (bulk) state.heading = selectedLabel(context.config.messages.selected, scope.getSelectedRecordsCount())
    if (context.config.clipboardMenu !== false && clipboard.clipboardSettings()) {
        if (kind === 'record' && context.row) copies.push({ type: 'item', label: context.config.messages.copy_row, run: () => copy([...context.row.querySelectorAll('td')].filter(cell => cell.getClientRects().length && !cell.querySelector('input[type=checkbox]') && !cell.querySelector('.fi-ta-actions')).map(cell => cell.innerText.trim()).join('\t'), state) })
        copies.push({ type: 'submenu', clipboardMenu: true, label: context.config.messages.clipboard, items: clipboardItems(state) })
    }
    items = normalize([...items, ...(copies.length ? [{ type: 'separator' }, ...copies] : []), ...(links.length ? [{ type: 'separator' }, ...links] : [])])
    if (!items.length) { close(true); return }
    state.items = items
    state.anchor = anchor
    draw(state)
    place(menu, anchor)
    menu.querySelector(keyboard ? 'button' : 'input,button')?.focus({ preventScroll: true })
}

function bootstrap(marker) {
    const config = JSON.parse(marker.dataset.warpContextMenuConfig)
    if (!document.getElementById('warp-context-menu-css')) {
        const link = document.createElement('link'); link.id = 'warp-context-menu-css'; link.rel = 'stylesheet'; link.href = config.css; document.head.append(link)
    }
    clipboard.installClipboard()
    if (installed) return
    installed = true
    document.addEventListener('contextmenu', event => {
        if (!event.shiftKey && clipboard.inputTarget(event.target) && openPaste(event.target, point(event))) { event.preventDefault(); return }
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
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'v' && clipboard.inputTarget(event.target)) {
            if (openPaste(event.target, clipboard.caretPoint(event.target), true)) event.preventDefault()
            return
        }
        if (active && event.key === 'Escape') {
            event.preventDefault()
            if (active.query || active.editing) { draw(active); active.menu.querySelector('input,button')?.focus() } else close(true)
            return
        }
        if (active && !event.target.matches('input,textarea') && event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.key !== ' ') {
            event.preventDefault(); draw(active, (active.query ?? '') + event.key); const input = active.menu.querySelector('input'); input?.focus(); return
        }
        if (active && event.key === 'Tab') { if (!active.menu.querySelector('.fi-warp-contextmenu-menu-editor')) close(); return }
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
    document.addEventListener('scroll', event => {
        cancelTouch()
        if (active && shouldCloseOnScroll({ sheet: active.sheet, insideMenu: active.menu.contains(event.target), start: active.scroll.get(event.target), current: scrollPosition(event.target) })) close()
    }, true)
    window.addEventListener('resize', () => close())
    document.addEventListener('livewire:navigated', () => { close(); cancelTouch(); cache = new WeakMap(); settledRows = new WeakMap(); lastRow = null })
    window.Livewire.hook('morph.removed', ({ el }) => { if (active?.context.row && el.contains(active.context.row)) close() })
    window.Livewire.hook('morph.updating', ({ component }) => { cache.delete(component.el); settledRows.delete(component.el) })
}

export default function warpContextMenu() {
    return { init() { bootstrap(this.$el) } }
}
