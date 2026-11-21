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
