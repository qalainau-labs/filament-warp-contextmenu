// @vitest-environment happy-dom
import { beforeEach, afterEach, it, expect, vi } from 'vitest'

let marker, table, target, component, hooks, factory, documentListeners, windowListeners
const nativeClosest = Element.prototype.closest
const nativeQueryAll = Element.prototype.querySelectorAll
const messages = { loading: 'Loading', label_record: 'Record actions', copy_cell: 'Copy', open_link_new_tab: 'Open', copy_link: 'Link' }
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
const rightClick = () => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 80, clientY: 90 })
    target.dispatchEvent(event)
    return event
}

const clipboardMessages = { clipboard: 'Clipboard', empty: 'Nothing copied yet', clear_all: 'Remove all', clear: 'Remove recent', add: 'Add text', edit: 'Edit text', save: 'Keep', unsave: 'Stop keeping', delete: 'Remove', copy_again: 'Copy again', saved_section: 'Kept', recent_section: 'Recent', added_text: '自分で足した文字' }
function installClipboard(entries = []) {
    window.WarpClipboard = {
        enabled: vi.fn(() => true), entries: vi.fn(() => entries), messages: clipboardMessages,
        relativeTime: vi.fn(() => '3 minutes ago'), openEditor: vi.fn(),
        keep: vi.fn(), remove: vi.fn(), clear: vi.fn(),
    }
    return window.WarpClipboard
}
const menuButton = label => [...document.querySelectorAll('[role=menuitem]')].find(node => node.getAttribute('aria-label') === label)

beforeEach(async () => {
    delete window.WarpClipboard
    vi.resetModules()
    // happy-dom 15 does not parse escaped colons in attribute selectors. Adapt
    // its selector parser; the real selectors are exercised by Playwright.
    vi.spyOn(Element.prototype, 'closest').mockImplementation(function (selector) {
        return nativeClosest.call(this, selector.replaceAll('\\:', ':'))
    })
    vi.spyOn(Element.prototype, 'querySelectorAll').mockImplementation(function (selector) {
        return nativeQueryAll.call(this, selector.replaceAll('\\:', ':'))
    })
    documentListeners = vi.spyOn(document, 'addEventListener')
    windowListeners = vi.spyOn(window, 'addEventListener')
    document.body.innerHTML = `<div wire:id="host"><div class="fi-ta"><div data-warp-context-menu-config></div><table><tbody><tr wire:key="host.table.records.abc"><td><div wire:key="host.table.record.abc.column.name">Alice</div></td></tr></tbody></table></div></div>`
    document.head.innerHTML = ''
    marker = document.querySelector('[data-warp-context-menu-config]')
    marker.dataset.warpContextMenuConfig = JSON.stringify({ kind: 'record', copyCell: false, links: false, bulk: false, messages, css: 'data:text/css,' })
    table = document.querySelector('.fi-ta')
    target = document.querySelector('td div')
    component = { $call: vi.fn(async method => method === '__warpContextMenu' ? { abc: { items: [{ type: 'item', name: 'edit', label: 'Edit', context: {} }], cells: {} } } : null) }
    hooks = {}
    window.Livewire = { find: () => component, hook: (name, callback) => { hooks[name] = callback } }
    window.Alpine = { $data: () => ({ getSelectedRecordsCount: () => 0 }) }
    factory = (await import('../../resources/js/index.js')).default
    factory().init.call({ $el: marker })
})

afterEach(() => {
    for (const args of documentListeners.mock.calls) document.removeEventListener(...args)
    for (const args of windowListeners.mock.calls) window.removeEventListener(...args)
    delete window.WarpClipboard
    vi.useRealTimers()
    vi.restoreAllMocks()
})

it('finds the record ancestor beyond a nested Filament column key and uses native mounting', async () => {
    expect(rightClick().defaultPrevented).toBe(true)
    await flush()
    const button = document.querySelector('[role=menuitem]')
    expect(button?.textContent).toContain('Edit')
    button.click()
    expect(component.$call).toHaveBeenLastCalledWith('mountAction', 'edit', {}, { table: true, recordKey: 'abc' })
    expect(document.querySelector('[role=menu]')).toBeNull()
})

it('installs one document contextmenu listener even when multiple markers initialize', async () => {
    factory().init.call({ $el: marker })
    rightClick()
    await flush()
    expect(component.$call).toHaveBeenCalledTimes(1)
    expect(document.querySelectorAll('[role=menu]')).toHaveLength(1)
})

it('keeps the native menu for prefetched empty rows', async () => {
    component.$call.mockResolvedValue({ abc: { items: [], cells: {} } })
    target.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
    await flush()
    expect(rightClick().defaultPrevented).toBe(false)
    expect(document.querySelector('[role=menu]')).toBeNull()
})

it('discards prefetched rows after a Livewire morph', async () => {
    target.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
    await flush()
    hooks['morph.updating']({ component: { el: table.closest('[wire\\:id]') } })
    rightClick()
    await flush()
    expect(component.$call).toHaveBeenCalledTimes(2)
})

it('never renders an action label as HTML', async () => {
    component.$call.mockResolvedValue({ abc: { items: [{ type: 'item', name: 'unsafe', label: '<img src=x onerror=alert(1)>' }], cells: {} } })
    rightClick()
    await flush()
    expect(document.querySelector('[role=menu] img')).toBeNull()
    expect(document.querySelector('[role=menuitem]').textContent).toContain('<img')
})

it('returns focus to an action when clearing the search of a small menu', async () => {
    rightClick()
    await flush()
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true }))
    const input = document.querySelector('.fi-warp-contextmenu-menu-search')
    expect(input).not.toBeNull()
    input.value = ''
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(document.querySelector('.fi-warp-contextmenu-menu-search')).toBeNull()
    expect(document.activeElement).toBe(document.querySelector('[role=menuitem]'))
})

it('keeps copy conveniences together before underlying link actions', async () => {
    const config = JSON.parse(marker.dataset.warpContextMenuConfig)
    Object.assign(config, { copyCell: true, links: true })
    installClipboard()
    Object.assign(config.messages, { copy_row: 'Copy row', clipboard: 'Clipboard' })
    marker.dataset.warpContextMenuConfig = JSON.stringify(config)
    target.innerHTML = '<a href="https://example.com">Alice</a>'
    target = target.querySelector('a')
    rightClick(); await flush()
    const nodes = [...document.querySelector('[role=menu]').children].filter(node => !node.matches('input'))
    expect(nodes.map(node => node.getAttribute('role'))).toEqual(['menuitem', 'separator', 'menuitem', 'menuitem', 'menuitem', 'separator', 'menuitem', 'menuitem'])
    expect(nodes.map(node => node.getAttribute('aria-label')).filter(Boolean)).toEqual(['Edit', 'Copy', 'Copy row', 'Clipboard', 'Open', 'Link'])
})


it('forwards configured arguments and context from the rendered action', async () => {
    component.$call.mockResolvedValue({ abc: { items: [{ type: 'item', name: 'argumentAction', label: 'Arguments', arguments: { name: 'Delivered' }, context: { custom: 'context' } }], cells: {} } })
    rightClick()
    await flush()
    document.querySelector('[role=menuitem]').click()
    expect(component.$call).toHaveBeenLastCalledWith('mountAction', 'argumentAction', { name: 'Delivered' }, { custom: 'context', table: true, recordKey: 'abc' })
})

it('excludes built-in copy, link and clipboard items from the search threshold', async () => {
    installClipboard()
    marker.dataset.warpContextMenuConfig = JSON.stringify({ kind: 'record', copyCell: true, links: true, messages: { ...messages, copy_row: 'Copy row' }, css: 'data:text/css,' })
    factory().init.call({ $el: marker })
    target.innerHTML = '<a href="https://example.com">Alice</a>'
    target = target.querySelector('a')
    component.$call.mockResolvedValue({ abc: { items: Array.from({ length: 5 }, (_, i) => ({ type: 'item', name: `action${i}`, label: `Action ${i}` })), cells: {} } })
    rightClick()
    await flush()
    expect(document.querySelectorAll('[role=menuitem]')).toHaveLength(10)
    expect(document.querySelector('.fi-warp-contextmenu-menu-search')).toBeNull()
})

it('keeps the open payload during morphs and fetches fresh actions on reopening', async () => {
    rightClick(); await flush()
    const menu = document.querySelector('[role=menu]')
    component.$call.mockResolvedValue({ abc: { items: [{ type: 'item', name: 'updated', label: 'Updated' }], cells: {} } })
    hooks['morph.updating']({ component: { el: table.closest('[wire\\:id]') } })
    expect(document.querySelector('[role=menu]')).toBe(menu)
    expect(menu.textContent).toContain('Edit')
    rightClick(); await flush()
    expect(document.querySelector('[role=menu]').textContent).toContain('Updated')
    expect(component.$call).toHaveBeenCalledTimes(2)
})

it('closes only when the open row or its ancestor is removed', async () => {
    rightClick(); await flush()
    const menu = document.querySelector('[role=menu]')
    hooks['morph.removed']?.({ el: target })
    hooks['morph.removed']?.({ el: document.createElement('tr') })
    expect(document.querySelector('[role=menu]')).toBe(menu)
    hooks['morph.removed']?.({ el: table })
    expect(document.querySelector('[role=menu]')).toBeNull()
})

it('ignores menu scrolling and closes at 24px from the opening ancestor position', async () => {
    table.scrollTop = 100
    rightClick(); await flush()
    const menu = document.querySelector('[role=menu]')
    menu.scrollTop = 100
    menu.dispatchEvent(new Event('scroll'))
    expect(document.querySelector('[role=menu]')).toBe(menu)
    table.scrollTop = 123
    table.dispatchEvent(new Event('scroll'))
    expect(document.querySelector('[role=menu]')).toBe(menu)
    table.scrollTop = 124
    table.dispatchEvent(new Event('scroll'))
    expect(document.querySelector('[role=menu]')).toBeNull()
})

it('keeps a mobile sheet open during background scrolling', async () => {
    vi.stubGlobal('innerWidth', 390)
    try {
        rightClick(); await flush()
        table.scrollTop = 100
        table.dispatchEvent(new Event('scroll'))
        expect(document.querySelector('[role=menu]')).not.toBeNull()
    } finally { vi.unstubAllGlobals() }
})


it('hides Remove all for empty clipboard history and shows it for recent entries', async () => {
    const clipboard = installClipboard()
    for (const entries of [[], [{ value: 'Recent text', time: 123 }]]) {
        clipboard.entries.mockReturnValue(entries)
        rightClick(); await flush()
        menuButton('Clipboard').click()
        const submenu = document.querySelector('.fi-warp-contextmenu-menu-submenu')
        expect(submenu.textContent.includes('Nothing copied yet')).toBe(entries.length === 0)
        expect(submenu.textContent.includes('Remove all')).toBe(entries.length > 0)
        expect(submenu.textContent).toContain('＋ Add text')
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    }
})


it.each([250, 700])('scrolls a mobile card of height %ipx above the sheet and shows its title first', async height => {
    vi.stubGlobal('innerWidth', 390)
    vi.stubGlobal('innerHeight', 844)
    try {
        component.$call.mockResolvedValue({ abc: { title: '<Alice>', items: [{ type: 'item', name: 'edit', label: 'Edit' }], cells: {} } })
        const row = target.closest('tr')
        vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ top: 400, bottom: 400 + height, height })
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(444)
        const scroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => document.dispatchEvent(new Event('scroll')))
        rightClick(); await flush()
        expect(scroll).toHaveBeenCalledWith({ top: height > 400 ? 400 : 258, behavior: 'smooth' })
        const menu = document.querySelector('[role=menu]')
        expect(menu.firstElementChild.textContent).toBe('<Alice>')
        expect(menu.querySelector('alice')).toBeNull()
        const space = document.body.lastElementChild
        expect(space.getAttribute('aria-hidden')).toBe('true')
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        expect(space.isConnected).toBe(false)
    } finally { vi.unstubAllGlobals() }
})

it('keeps the record title out of desktop menus', async () => {
    component.$call.mockResolvedValue({ abc: { title: 'Alice title', items: [{ type: 'item', name: 'edit', label: 'Edit' }], cells: {} } })
    rightClick(); await flush()
    expect(document.querySelector('[role=menu]').textContent).not.toContain('Alice title')
})

it('uses Clipboard messages, relative times and entry sources', async () => {
    const clipboard = installClipboard([
        { value: 'Typed value', name: 'Typed name', addedByUser: true, kept: true, time: 123 },
        { value: 'Copied value', source: 'Invoice · Name', time: 456 },
    ])
    rightClick(); await flush()
    menuButton('Clipboard').click()
    const submenu = document.querySelector('.fi-warp-contextmenu-menu-submenu')
    expect(submenu.textContent).toContain('自分で足した文字 · 3 minutes ago')
    expect(submenu.textContent).toContain('Invoice · Name · 3 minutes ago')
    expect(menuButton('Typed name').querySelector('strong').textContent).toBe('Typed name')
    expect(menuButton('Typed name').querySelector('.fi-warp-contextmenu-menu-preview').textContent).toBe('Typed value')
    expect(clipboard.relativeTime).toHaveBeenCalledWith(123)
})

it('shows the Clipboard submenu only while the separate plugin is enabled and allowed for the table', async () => {
    rightClick(); await flush()
    expect(menuButton('Clipboard')).toBeUndefined()
    const clipboard = installClipboard()
    rightClick(); await flush()
    expect(menuButton('Clipboard')).toBeDefined()
    clipboard.enabled.mockReturnValue(false)
    rightClick(); await flush()
    expect(menuButton('Clipboard')).toBeUndefined()
    clipboard.enabled.mockReturnValue(true)
    const config = JSON.parse(marker.dataset.warpContextMenuConfig)
    config.clipboardMenu = false
    marker.dataset.warpContextMenuConfig = JSON.stringify(config)
    rightClick(); await flush()
    expect(menuButton('Clipboard')).toBeUndefined()
})

it('copies a row without Warp Clipboard even when its submenu is disabled', async () => {
    const config = JSON.parse(marker.dataset.warpContextMenuConfig)
    config.clipboardMenu = false
    config.messages.copy_row = 'Copy row'
    marker.dataset.warpContextMenuConfig = JSON.stringify(config)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    vi.spyOn(target.closest('td'), 'getClientRects').mockReturnValue([{}])
    target = target.closest('td')
    target.innerText = 'Alice'
    rightClick(); await flush()
    menuButton('Copy row').click(); await flush()
    expect(writeText).toHaveBeenCalledExactlyOnceWith('Alice')
})

it('closes the menu before opening the Clipboard editor to add or edit text', async () => {
    const entry = { value: 'Saved value', kept: true, time: 123 }
    const clipboard = installClipboard([entry])
    clipboard.openEditor.mockImplementation(() => expect(document.querySelector('[role=menu]')).toBeNull())
    rightClick(); await flush()
    menuButton('Clipboard').click()
    menuButton('＋ Add text').click()
    expect(clipboard.openEditor).toHaveBeenLastCalledWith({ x: 80, y: 90 }, null)
    rightClick(); await flush()
    menuButton('Clipboard').click()
    menuButton('Saved value').click()
    menuButton('Edit text').click()
    expect(clipboard.openEditor).toHaveBeenLastCalledWith({ x: 80, y: 90 }, entry)
})

it('redraws Clipboard entries after keeping, removing and clearing them', async () => {
    const entry = { value: 'Recent value', time: 123 }
    const clipboard = installClipboard([entry])
    clipboard.keep.mockImplementation((value, kept) => { entry.kept = kept })
    clipboard.remove.mockImplementation(() => clipboard.entries.mockReturnValue([]))
    clipboard.clear.mockImplementation(() => clipboard.entries.mockReturnValue([]))
    rightClick(); await flush()
    menuButton('Clipboard').click(); menuButton('Recent value').click(); menuButton('Keep').click()
    expect(clipboard.keep).toHaveBeenCalledWith('Recent value', true)
    menuButton('Clipboard').click(); menuButton('Recent value').click()
    expect(menuButton('Stop keeping')).toBeDefined()
    menuButton('Remove').click()
    expect(clipboard.remove).toHaveBeenCalledWith('Recent value')
    menuButton('Clipboard').click()
    expect(menuButton('Nothing copied yet')).toBeDefined()
    clipboard.entries.mockReturnValue([{ value: 'Another', time: 456 }])
    rightClick(); await flush()
    menuButton('Clipboard').click(); menuButton('Remove all').click()
    expect(clipboard.clear).toHaveBeenCalledOnce()
    menuButton('Clipboard').click()
    expect(menuButton('Nothing copied yet')).toBeDefined()
})

it('does not open a menu when a capture listener already prevented contextmenu', async () => {
    const prevent = event => event.preventDefault()
    document.addEventListener('contextmenu', prevent, true)
    expect(rightClick().defaultPrevented).toBe(true)
    await flush()
    expect(component.$call).not.toHaveBeenCalled()
    expect(document.querySelector('[role=menu]')).toBeNull()
    document.removeEventListener('contextmenu', prevent, true)
})

it('keeps nested widget entry actions on the widget and page header actions on the page', async () => {
    const pageMarker = document.createElement('div')
    pageMarker.dataset.warpContextMenuKind = 'page'
    pageMarker.dataset.warpContextMenuConfig = JSON.stringify({ kind: 'page', messages: { ...messages, copy_value: 'Copy value' }, css: 'data:text/css,' })
    table.parentElement.append(pageMarker)
    const widget = document.createElement('div')
    widget.setAttribute('wire:id', 'widget')
    widget.innerHTML = '<div data-warp-context-menu-entry="infolist.name"><span data-warp-context-menu-entry-value>Widget value</span></div>'
    table.parentElement.append(widget)
    target = widget.querySelector('span')
    const widgetComponent = { $call: vi.fn(async () => ({ items: [{ type: 'item', name: 'entryAction', label: 'Entry action', context: { schemaComponent: 'infolist.name' } }], copyValue: true })) }
    component.$call.mockImplementation(async (method, keys, kind) => kind === 'page' ? [{ type: 'item', name: 'pageAction', label: 'Page action' }] : [])
    window.Livewire.find = id => id === 'widget' ? widgetComponent : component
    rightClick(); await flush()
    expect(document.querySelector('[role=menu]').textContent).toContain('Copy value')
    expect(widgetComponent.$call).toHaveBeenCalledWith('__warpContextMenu', ['infolist.name'], 'entry')
    const buttons = () => [...document.querySelectorAll('[role=menuitem]')]
    buttons().find(button => button.getAttribute('aria-label') === 'Page action').click()
    expect(component.$call).toHaveBeenLastCalledWith('mountAction', 'pageAction', {}, {})
    rightClick(); await flush()
    buttons().find(button => button.getAttribute('aria-label') === 'Entry action').click()
    expect(widgetComponent.$call).toHaveBeenLastCalledWith('mountAction', 'entryAction', {}, { schemaComponent: 'infolist.name' })
})

function emptySurface(kind) {
    const config = { kind, headers: true, tableMenu: true, clipboardMenu: false, messages: { ...messages, empty: 'No actions for this record', empty_page: 'No actions on this page', empty_table: 'No actions for this table', empty_column: 'No actions for this column', empty_entry: 'No actions for this value' }, css: 'data:text/css,' }
    marker.dataset.warpContextMenuKind = 'record'
    marker.dataset.warpContextMenuConfig = JSON.stringify(config)
    if (kind === 'page' || kind === 'entry') {
        const pageMarker = document.createElement('div')
        pageMarker.dataset.warpContextMenuKind = 'page'
        pageMarker.dataset.warpContextMenuConfig = JSON.stringify(config)
        table.parentElement.append(pageMarker)
        target = document.createElement('p')
        target.textContent = 'Page description'
        if (kind === 'entry') target.dataset.warpContextMenuEntry = 'infolist.name'
        table.parentElement.append(target)
    } else if (kind === 'column') {
        const header = document.createElement('th')
        header.dataset.warpContextMenuHeader = 'name'
        table.querySelector('table').append(header)
        target = header
    } else target = table
    component.$call.mockImplementation(async (method, keys, surface) => surface === 'entry' ? { items: [], copyValue: false } : [])
}

it.each(['page', 'column', 'table', 'entry'])('prefetches %s actions and preserves the native menu when empty', async kind => {
    emptySurface(kind)
    target.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
    await flush()
    expect(component.$call).toHaveBeenCalledWith('__warpContextMenu', kind === 'entry' ? ['infolist.name'] : [], kind)
    expect(rightClick().defaultPrevented).toBe(false)
    expect(document.querySelector('[role=menu]')).toBeNull()
})

it.each(['page', 'column', 'table', 'entry'])('shows the %s empty message if opened before prefetch settles', async kind => {
    emptySurface(kind)
    expect(rightClick().defaultPrevented).toBe(true)
    await flush()
    const menu = document.querySelector('[role=menu]')
    expect(menu).not.toBeNull()
    expect(menu.textContent).toBe(JSON.parse(marker.dataset.warpContextMenuConfig).messages[`empty_${kind}`])
    expect(menu.querySelector('button')).toBeNull()
})

it('invalidates prefetched page actions after a morph', async () => {
    emptySurface('page')
    target.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
    await flush()
    component.$call.mockResolvedValue([{ type: 'item', name: 'fresh', label: 'Fresh' }])
    hooks['morph.updating']({ component: { el: table.parentElement } })
    expect(rightClick().defaultPrevented).toBe(true)
    await flush()
    expect(document.querySelector('[role=menu]').textContent).toContain('Fresh')
})

it('keeps built-in page commands when the prefetched page payload is empty', async () => {
    emptySurface('page')
    const pageMarker = document.querySelector('[data-warp-context-menu-kind="page"]')
    const config = JSON.parse(pageMarker.dataset.warpContextMenuConfig)
    Object.assign(config.messages, { copy_page_link: 'Copy page link', reload_page: 'Reload page', back: 'Back', forward: 'Forward' })
    pageMarker.dataset.warpContextMenuConfig = JSON.stringify(config)
    target.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
    await flush()
    expect(rightClick().defaultPrevented).toBe(true)
    await flush()
    expect([...document.querySelectorAll('[role=menuitem]')].map(button => button.getAttribute('aria-label'))).toEqual(['Copy page link', 'Reload page', 'Back', 'Forward'])
    expect(component.$call).toHaveBeenCalledTimes(1)
})

it('deduplicates pending page requests and shows the empty message on a fast right click', async () => {
    emptySurface('page')
    let resolve
    component.$call.mockReturnValue(new Promise(done => { resolve = done }))
    target.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
    target.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
    expect(rightClick().defaultPrevented).toBe(true)
    expect(document.querySelector('[role=menu]').textContent).toBe('Loading')
    expect(component.$call).toHaveBeenCalledTimes(1)
    resolve([])
    await flush()
    expect(document.querySelector('[role=menu]').textContent).toBe('No actions on this page')
})

it('retries a failed page prefetch rather than treating failure as a known empty menu', async () => {
    emptySurface('page')
    component.$call.mockRejectedValueOnce(new Error('Offline'))
    target.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
    await flush()
    component.$call.mockResolvedValue([{ type: 'item', name: 'retry', label: 'Retry action' }])
    expect(rightClick().defaultPrevented).toBe(true)
    await flush()
    expect(document.querySelector('[role=menu]').textContent).toBe('Retry action')
    expect(component.$call).toHaveBeenCalledTimes(2)
})

it('keeps entry payloads separate within the same component', async () => {
    emptySurface('entry')
    target.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
    await flush()
    const other = target.cloneNode(true)
    other.dataset.warpContextMenuEntry = 'infolist.other'
    target.parentElement.append(other)
    target = other
    component.$call.mockResolvedValue({ items: [{ type: 'item', name: 'other', label: 'Other entry' }] })
    target.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
    await flush()
    expect(rightClick().defaultPrevented).toBe(true)
    await flush()
    expect(document.querySelector('[role=menu]').textContent).toBe('Other entry')
    expect(component.$call).toHaveBeenCalledWith('__warpContextMenu', ['infolist.other'], 'entry')
    expect(component.$call).toHaveBeenCalledTimes(3)
})

it('discards page payloads on Livewire navigation', async () => {
    emptySurface('page')
    target.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
    await flush()
    document.dispatchEvent(new Event('livewire:navigated'))
    component.$call.mockResolvedValue([{ type: 'item', name: 'next', label: 'Next page' }])
    expect(rightClick().defaultPrevented).toBe(true)
    await flush()
    expect(document.querySelector('[role=menu]').textContent).toBe('Next page')
})

it('shows the existing record empty message when the first fetch returns no actions', async () => {
    const config = JSON.parse(marker.dataset.warpContextMenuConfig)
    config.messages.empty = 'No actions for this record'
    marker.dataset.warpContextMenuConfig = JSON.stringify(config)
    component.$call.mockResolvedValue({ abc: { items: [], cells: {} } })
    expect(rightClick().defaultPrevented).toBe(true)
    await flush()
    expect(document.querySelector('[role=menu]').textContent).toBe('No actions for this record')
})

// A page marker makes body resolve to a page even when a specific surface was hovered.
it.each(['ContextMenu', 'F10'])('uses the hovered cell with body focus and %s when pages are enabled', async key => {
    const recordReply = { abc: { items: [{ type: 'item', name: 'edit', label: 'Edit' }], cells: {} } }
    component.$call.mockImplementation(async (method, keys, kind) => kind === 'record' ? recordReply : [])
    const pageMarker = marker.cloneNode(true)
    pageMarker.dataset.warpContextMenuKind = 'page'
    pageMarker.dataset.warpContextMenuConfig = JSON.stringify({ kind: 'page', messages: { ...messages, label_page: 'Page actions' }, css: 'data:text/css,' })
    table.parentElement.append(pageMarker)
    target.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
    await flush()
    document.activeElement?.blur()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey: key === 'F10', bubbles: true, cancelable: true }))
    await flush()
    expect(document.querySelector('[role=menu]')?.getAttribute('aria-label')).toBe('Record actions')
    expect(document.querySelector('[role=menu]')?.textContent).toContain('Edit')
})


it.each([false, true])('clipboard clear confirmation requires a second click (kept=%s)', async kept => {
    const clipboard = installClipboard([{ value: 'Example', kept, time: 1 }])
    clipboard.messages = { ...clipboardMessages, confirm_clear: 'Click again to remove' }
    rightClick(); await flush()
    menuButton('Clipboard').click()
    const label = kept ? clipboardMessages.clear : clipboardMessages.clear_all
    menuButton(label).click()
    expect(clipboard.clear).not.toHaveBeenCalled()
    expect(menuButton('Click again to remove')?.textContent).toContain('Click again to remove')
    expect(document.querySelector('.fi-warp-contextmenu-menu-submenu')).not.toBeNull()
    menuButton('Click again to remove').click()
    expect(clipboard.clear).toHaveBeenCalledTimes(1)
})

it.each(['other item', 'search', 'close', 'submenu back'])('clipboard clear confirmation resets on %s', async operation => {
    const clipboard = installClipboard([{ value: 'Example', time: 1 }])
    clipboard.messages = { ...clipboardMessages, confirm_clear: 'Click again to remove' }
    rightClick(); await flush()
    menuButton('Clipboard').click()
    menuButton(clipboardMessages.clear_all).click()
    expect(clipboard.clear).not.toHaveBeenCalled()
    if (operation === 'other item') {
        menuButton('Example').click()
    } else if (operation === 'search') {
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }))
    } else if (operation === 'submenu back') {
        menuButton('Click again to remove').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    } else {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        rightClick(); await flush()
    }
    expect(menuButton('Click again to remove')).toBeUndefined()
    if (operation === 'search') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    menuButton('Clipboard').click()
    menuButton(clipboardMessages.clear_all).click()
    expect(clipboard.clear).not.toHaveBeenCalled()
})

it('clipboard clear without confirmation message still clears immediately', async () => {
    const clipboard = installClipboard([{ value: 'Example', time: 1 }])
    rightClick(); await flush()
    menuButton('Clipboard').click()
    menuButton(clipboardMessages.clear_all).click()
    expect(clipboard.clear).toHaveBeenCalledTimes(1)
})


it.each([90, 700])('retains the initial menu edge through search and Clipboard redraw at y=%i', async y => {
    vi.stubGlobal('innerWidth', 1000)
    vi.stubGlobal('innerHeight', 800)
    try {
        installClipboard([{ value: 'Example', time: 1 }])
        component.$call.mockResolvedValue({ abc: { items: Array.from({ length: 10 }, (_, i) => ({ type: 'item', label: `Action ${i}`, name: `action${i}` })), cells: {} } })
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
            const height = this.querySelector('input')?.value ? 100 : 400
            return { x: 80, y: Number.parseFloat(this.style.top) || 0, width: 200, height }
        })
        target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 80, clientY: y }))
        await flush()
        const menu = document.querySelector('body > [role=menu]')
        expect(menu.style.top).toBe(`${y === 700 ? 300 : 90}px`)
        for (const query of ['Action 1', 'Action', '']) {
            const input = menu.querySelector('input')
            input.value = query
            input.dispatchEvent(new Event('input', { bubbles: true }))
            expect(menu.style.top).toBe(`${y === 700 ? query ? 600 : 300 : 90}px`)
        }
        menuButton('Clipboard').click()
        menuButton(clipboardMessages.clear_all).click()
        expect(menu.style.top).toBe(`${y === 700 ? 300 : 90}px`)
    } finally { vi.unstubAllGlobals() }
})


const pointer = (type, pointerType = 'touch', x = 80) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType, clientX: x, clientY: 90 }))
const navigate = () => {
    const event = new CustomEvent('alpine:navigate', { bubbles: true, cancelable: true })
    document.dispatchEvent(event)
    return event
}
const holdTouch = async (duration, release = 'pointerup') => {
    vi.useFakeTimers()
    pointer('pointerdown')
    await vi.advanceTimersByTimeAsync(duration)
    expect(document.querySelector('[role=menu]')).not.toBeNull()
    pointer(release)
}

it.each([600, 2000])('blocks navigation at window capture after a %ims touch hold', async duration => {
    const bubble = vi.fn()
    const documentListener = vi.fn()
    window.addEventListener('alpine:navigate', bubble)
    document.addEventListener('alpine:navigate', documentListener)
    await holdTouch(duration)
    expect(navigate().defaultPrevented).toBe(true)
    expect(bubble).not.toHaveBeenCalled()
    expect(documentListener).not.toHaveBeenCalled()
    expect(navigate().defaultPrevented).toBe(false)
    expect(bubble).toHaveBeenCalledTimes(1)
})

it('expires touch navigation suppression one second after release', async () => {
    await holdTouch(2000)
    await vi.advanceTimersByTimeAsync(1001)
    expect(navigate().defaultPrevented).toBe(false)
})

it('suppresses navigation for a second after cancelling an opened touch hold', async () => {
    await holdTouch(2000, 'pointercancel')
    await vi.advanceTimersByTimeAsync(999)
    expect(navigate().defaultPrevented).toBe(true)
})

it.each(['short touch', 'mouse', 'pen', 'moved touch'])('allows navigation after %s', async kind => {
    vi.useFakeTimers()
    const pointerType = ['mouse', 'pen'].includes(kind) ? kind : 'touch'
    pointer('pointerdown', pointerType)
    if (kind === 'moved touch') pointer('pointermove', 'touch', 100)
    await vi.advanceTimersByTimeAsync(kind === 'short touch' ? 200 : 600)
    pointer('pointerup', pointerType)
    expect(document.querySelector('[role=menu]')).toBeNull()
    expect(navigate().defaultPrevented).toBe(false)
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    target.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(false)
})

it('keeps click and navigation suppression independent after a long touch hold', async () => {
    await holdTouch(2000)
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    target.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    expect(navigate().defaultPrevented).toBe(true)
    const next = new MouseEvent('click', { bubbles: true, cancelable: true })
    target.dispatchEvent(next)
    expect(next.defaultPrevented).toBe(false)
})
