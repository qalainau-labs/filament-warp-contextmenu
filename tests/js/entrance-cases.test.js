// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import cases from './entrance-cases.json'
import { surface } from '../../resources/js/core/surfaces.js'

const operation = cases.operations['menu.open']
const nativeClosest = Element.prototype.closest
const nativeQueryAll = Element.prototype.querySelectorAll
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
let documentListeners, windowListeners, factory

const rightClick = target => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 80, clientY: 90 })
    target.dispatchEvent(event)
    return event
}

const drivers = [
    ['right-click', async target => rightClick(target)],
    ['keyboard', async target => {
        target.tabIndex = 0
        target.focus()
        const event = new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true })
        target.dispatchEvent(event)
        return event
    }],
    ['long-press', async target => {
        vi.useFakeTimers()
        const event = new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true, cancelable: true, clientX: 80, clientY: 90 })
        target.dispatchEvent(event)
        await vi.advanceTimersByTimeAsync(500)
        target.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', bubbles: true }))
        return event
    }],
]

const row = key => `<tr wire:key="host.table.records.${key}"><td><span data-target data-warp-context-menu-column="name">${key}</span></td></tr>`
const fixtures = [
    ['record', {
        html: `<div class="fi-ta"><div data-warp-context-menu-config></div><table><tbody>${row('abc')}</tbody></table></div>`,
        requests: [[['abc'], 'record']],
        reply: () => ({ abc: { items: [], cells: {} } }),
    }],
    ['bulk', {
        html: `<div class="fi-ta"><div data-warp-context-menu-config></div><table><tbody>${row('abc')}${row('def')}</tbody></table></div>`,
        selected: ['abc', 'def'],
        requests: [[[], 'bulk']],
        reply: kind => kind === 'record' ? { abc: { items: [], cells: {} }, def: { items: [], cells: {} } } : [],
    }],
    ['column', {
        html: '<div class="fi-ta"><div data-warp-context-menu-config></div><table><thead><tr><th data-target data-warp-context-menu-header="name">Name</th></tr></thead></table></div>',
        requests: [[[], 'column']],
        reply: () => [],
    }],
    ['table', {
        html: '<div class="fi-ta"><div data-warp-context-menu-config></div><div data-target>Table background</div></div>',
        requests: [[[], 'table']],
        reply: () => [],
    }],
    ['entry', {
        html: '<div data-warp-context-menu-kind="page" data-warp-context-menu-config></div><div data-warp-context-menu-entry="infolist.name"><span data-target data-warp-context-menu-entry-value>Value</span></div>',
        requests: [[['infolist.name'], 'entry'], [[], 'page']],
        reply: kind => kind === 'entry' ? { items: [], copyValue: false } : [],
    }],
    ['page', {
        html: '<div data-warp-context-menu-kind="page" data-warp-context-menu-config></div><p data-target>Page background</p>',
        requests: [[[], 'page']],
        reply: () => [],
    }],
]

beforeEach(async () => {
    vi.resetModules()
    // Same happy-dom escaped-colon selector adaptation as events.test.js.
    vi.spyOn(Element.prototype, 'closest').mockImplementation(function (selector) {
        return nativeClosest.call(this, selector.replaceAll('\\:', ':'))
    })
    vi.spyOn(Element.prototype, 'querySelectorAll').mockImplementation(function (selector) {
        return nativeQueryAll.call(this, selector.replaceAll('\\:', ':'))
    })
    documentListeners = vi.spyOn(document, 'addEventListener')
    windowListeners = vi.spyOn(window, 'addEventListener')
    document.body.innerHTML = ''
    document.head.innerHTML = ''
    window.Livewire = { find: () => null, hook: vi.fn() }
    window.Alpine = { $data: () => ({ getSelectedRecordsCount: () => 0 }) }
    factory = (await import('../../resources/js/index.js')).default
})

afterEach(() => {
    document.dispatchEvent(new Event('livewire:navigated'))
    for (const args of documentListeners.mock.calls) document.removeEventListener(...args)
    for (const args of windowListeners.mock.calls) window.removeEventListener(...args)
    vi.useRealTimers()
    vi.restoreAllMocks()
})

it('has exactly one driver and fixture for every menu.open entrance and surface', () => {
    expect(drivers.map(([key]) => key).sort()).toEqual(Object.keys(operation.entrances).sort())
    expect(fixtures.map(([key]) => key).sort()).toEqual([...operation.surfaces].sort())
    // except は表の surfaces の種類だけに、理由つきで書く
    for (const spec of Object.values(operation.entrances)) {
        for (const [kind, other] of Object.entries(spec.except ?? {})) {
            expect(operation.surfaces).toContain(kind)
            expect(other.why?.trim()).toBeTruthy()
        }
    }
})

it('lists every surface reachable through all boolean inputs and bulk selection', () => {
    const keys = ['table', 'record', 'header', 'entry', 'pages', 'enabled', 'headers', 'tableMenu']
    const reachable = new Set(['bulk'])
    for (let bits = 0; bits < 2 ** keys.length; bits++) {
        const kind = surface(Object.fromEntries(keys.map((key, index) => [key, Boolean(bits & (1 << index))])))
        if (kind !== null) reachable.add(kind)
    }
    expect([...reachable].sort()).toEqual([...operation.surfaces].sort())
})

const combinations = Object.entries(operation.entrances).flatMap(([entrance, spec]) =>
    operation.surfaces.map(kind => ({ entrance, kind, expected: spec.except?.[kind]?.expect ?? spec.expect })))

it.each(combinations)('$entrance / $kind follows $expected for an empty menu', async ({ entrance, kind, expected }) => {
    const driver = drivers.find(([key]) => key === entrance)?.[1]
    const fixture = fixtures.find(([key]) => key === kind)?.[1]
    expect(driver, `Missing driver: ${entrance}`).toBeTypeOf('function')
    expect(fixture, `Missing fixture: ${kind}`).toBeDefined()
    expect(['native', 'empty-message']).toContain(expected)

    document.body.innerHTML = `<div wire:id="host">${fixture.html}</div>`
    const messages = {
        loading: 'Loading', empty: 'No record actions',
        empty_bulk: 'No bulk actions', empty_column: 'No column actions',
        empty_table: 'No table actions', empty_entry: 'No entry actions', empty_page: 'No page actions',
        [`label_${kind}`]: `${kind} actions`,
    }
    const marker = document.querySelector('[data-warp-context-menu-config]')
    // Omit page/table convenience labels so their built-in commands cannot appear.
    marker.dataset.warpContextMenuConfig = JSON.stringify({
        kind: ['entry', 'page'].includes(kind) ? 'page' : 'record',
        headers: true, tableMenu: true, bulk: kind === 'bulk',
        copyCell: false, links: false, clipboardMenu: false, clipboard: { enabled: false },
        selectedCount: ':count selected', messages, css: 'data:text/css,',
    })
    const component = { $call: vi.fn(async (method, keys, requestKind) => fixture.reply(requestKind)) }
    window.Livewire.find = () => component
    window.Alpine.$data = () => ({
        getSelectedRecordsCount: () => fixture.selected?.length ?? 0,
        isRecordSelected: key => fixture.selected?.includes(key) ?? false,
    })
    factory().init.call({ $el: marker })
    const target = document.querySelector('[data-target]')
    const assertEmptyMessage = () => {
        const menu = document.querySelector('[role=menu]')
        expect(menu).not.toBeNull()
        expect(menu.getAttribute('aria-label')).toBe(messages[`label_${kind}`])
        expect(menu.textContent).toContain(messages[`empty_${kind}`] ?? messages.empty)
        expect(menu.textContent).not.toContain(messages.loading)
        expect(menu.querySelector('[role=menuitem]')).toBeNull()
    }

    // A cold right click may open, but it must retain the empty message.
    const event = await driver(target)
    await flush()
    if (expected === 'native' && !event.defaultPrevented) {
        expect(document.querySelector('[role=menu]')).toBeNull()
    } else {
        if (entrance !== 'long-press') expect(event.defaultPrevented).toBe(true)
        assertEmptyMessage()
    }
    for (const [keys, requestKind] of fixture.requests) {
        expect(component.$call).toHaveBeenCalledWith('__warpContextMenu', keys, requestKind)
    }

    if (expected === 'native') {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        expect(document.querySelector('[role=menu]')).toBeNull()
        target.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }))
        await flush()
        expect((await driver(target)).defaultPrevented).toBe(false)
        await flush()
        expect(document.querySelector('[role=menu]')).toBeNull()
    }
})
