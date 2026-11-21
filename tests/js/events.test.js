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

beforeEach(async () => {
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
    Object.assign(config, { copyCell: true, links: true, clipboard: { enabled: true, key: 'test-grouping', limit: 10, persist: true } })
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
    marker.dataset.warpContextMenuConfig = JSON.stringify({ kind: 'record', copyCell: true, links: true, clipboard: { enabled: true, key: 'search-threshold', limit: 10, persist: false }, messages, css: 'data:text/css,' })
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
    const config = JSON.parse(marker.dataset.warpContextMenuConfig)
    Object.assign(config, { clipboard: { enabled: true, key: 'test-empty-history', limit: 10, persist: true } })
    Object.assign(config.messages, { clipboard: 'Clipboard', clipboard_empty: 'Nothing copied yet', clipboard_clear_all: 'Remove all', clipboard_add: 'Add text' })
    marker.dataset.warpContextMenuConfig = JSON.stringify(config)
    for (const entries of [[], [{ value: 'Recent text', time: Date.now() }]]) {
        sessionStorage.setItem(`${config.clipboard.key}:recent`, JSON.stringify(entries))
        rightClick(); await flush()
        const button = [...document.querySelectorAll('[role=menuitem]')].find(node => node.getAttribute('aria-label') === 'Clipboard')
        button.click()
        const submenu = document.querySelector('.fi-warp-contextmenu-menu-submenu')
        expect(submenu.textContent.includes('Nothing copied yet')).toBe(entries.length === 0)
        expect(submenu.textContent.includes('Remove all')).toBe(entries.length > 0)
        expect(submenu.textContent).toContain('＋ Add text')
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    }
    sessionStorage.removeItem(`${config.clipboard.key}:recent`)
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

it('labels manually added clipboard text in the current locale and preserves copied sources', async () => {
    const config = JSON.parse(marker.dataset.warpContextMenuConfig)
    Object.assign(config, { clipboard: { enabled: true, key: 'test-added-text', limit: 10, persist: true } })
    Object.assign(config.messages, { clipboard: 'Clipboard', clipboard_added_text: '自分で足した文字', clipboard_add: 'Add text' })
    marker.dataset.warpContextMenuConfig = JSON.stringify(config)
    const clipboard = await import('../../resources/js/clipboard.js')
    clipboard.capture('Copied value', 'Invoice · Name')
    clipboard.save('Typed value', 'Typed name')
    expect(clipboard.entries()[0]).toMatchObject({ addedByUser: true, source: null })
    rightClick(); await flush()
    const button = [...document.querySelectorAll('[role=menuitem]')].find(node => node.getAttribute('aria-label') === 'Clipboard')
    button.click()
    const submenu = document.querySelector('.fi-warp-contextmenu-menu-submenu')
    expect(submenu.textContent).toContain('自分で足した文字')
    expect(submenu.textContent).toContain('Invoice · Name')
    localStorage.removeItem(config.clipboard.key)
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
