import positionCases from './position-cases.json'
import { describe, it, expect } from 'vitest'
import { position, normalize, navigate, typeahead, shortcut, longPress, safeTriangle, selectedLabel } from '../../resources/js/core/menu.js'

describe('position', () => {
    it.each(positionCases)('$name', ({ point, size, viewport, rtl, expected }) => {
        expect(position(point, size, viewport, rtl, true)).toEqual(expected)
    })
    it('flips at the right and bottom viewport edges', () => {
        expect(position({ x: 980, y: 740 }, { width: 200, height: 300 }, { width: 1000, height: 800 })).toEqual({ x: 780, y: 440, maxHeight: 784 })
    })
    it('opens to the left in RTL and clamps oversized menus', () => {
        expect(position({ x: 300, y: 20 }, { width: 200, height: 900 }, { width: 1000, height: 800 }, true)).toEqual({ x: 100, y: 8, maxHeight: 784 })
        expect(position({ x: 2, y: 2 }, { width: 600, height: 100 }, { width: 400, height: 300 })).toMatchObject({ x: 8, y: 8 })
    })
    it('flips a submenu away from the left edge', () => {
        expect(position({ x: 5, y: 30, right: 205 }, { width: 100, height: 100 }, { width: 800, height: 600 }, true, true).x).toBe(205)
    })
})
it('removes empty groups and adjacent or edge separators without mutating input', () => {
    const items = [{ type: 'separator' }, { type: 'submenu', items: [] }, { type: 'item', label: 'A' }, { type: 'separator' }, { type: 'separator' }]
    expect(normalize(items)).toEqual([{ type: 'item', label: 'A' }]); expect(items).toHaveLength(5)
})
it('moves past disabled actions and separators, wrapping at edges', () => {
    const items = [{ type: 'item' }, { type: 'separator' }, { type: 'item', disabled: true }, { type: 'submenu' }]
    expect(navigate(items, 0, 'ArrowDown')).toBe(3)
    expect(navigate(items, -1, 'ArrowUp')).toBe(3)
    expect(navigate(items, -1, 'ArrowDown')).toBe(0)
    expect(navigate(items, 0, 'ArrowUp')).toBe(3)
    expect(navigate(items, 3, 'Home')).toBe(0)
    expect(navigate(items, 0, 'End')).toBe(3)
    expect(navigate([], 0, 'Home')).toBe(-1)
})
it('finds matching text after the current item and skips disabled matches', () => {
    const items = [{ type: 'item', label: 'Edit' }, { type: 'item', label: 'Export', disabled: true }, { type: 'item', label: 'Email' }]
    expect(typeahead(items, 'e', 0)).toBe(2)
    expect(typeahead(items, 'edit', 2)).toBe(0)
    expect(typeahead(items, 'z')).toBe(-1)
})
it('formats keyboard shortcuts for each platform', () => {
    expect(shortcut(['mod+e'], true)).toBe('⌘E')
    expect(shortcut('mod+shift+e')).toBe('Ctrl+Shift+E')
    expect(shortcut('ctrl+alt+x', true)).toBe('⌃⌥X')
    expect(shortcut(null)).toBe('')
})
it('requires 500ms and cancels long press after movement or scroll', () => {
    expect(longPress({ x: 0, y: 0 }, { x: 5, y: 5 }, 500)).toBe(true)
    expect(longPress({ x: 0, y: 0 }, { x: 11, y: 0 }, 500)).toBe(false)
    expect(longPress({ x: 0, y: 0 }, { x: 0, y: 0 }, 499)).toBe(false)
    expect(longPress({ x: 0, y: 0 }, { x: 0, y: 0 }, 500, true)).toBe(false)
})
it('keeps diagonal movement inside the submenu safe triangle', () => {
    expect(safeTriangle({ x: 60, y: 30 }, { x: 0, y: 50 }, { x: 100, y: 0 }, { x: 100, y: 100 })).toBe(true)
    expect(safeTriangle({ x: 40, y: 120 }, { x: 0, y: 50 }, { x: 100, y: 0 }, { x: 100, y: 100 })).toBe(false)
})
it('uses translated plural selection messages', () => {
    const message = '{1} 1 record selected|[2,*] :count records selected'
    expect(selectedLabel(message, 1)).toBe('1 record selected')
    expect(selectedLabel(message, 8)).toBe('8 records selected')
    expect(selectedLabel(':count 件の記録を選択中', 8)).toBe('8 件の記録を選択中')
})


it('preserves coordinates for fitting menus including the exact usable width', () => {
    expect(position({ x: 40, y: 30 }, { width: 200, height: 100 }, { width: 800, height: 600 })).toEqual({ x: 40, y: 30, maxHeight: 584 })
    expect(position({ x: 592, y: 492 }, { width: 200, height: 100 }, { width: 800, height: 600 })).toEqual({ x: 592, y: 492, maxHeight: 584 })
})
it('preserves interior separators and nonempty submenus', () => {
    const x = { type: 'item', label: 'X' }, y = { type: 'item', label: 'Y' }
    expect(normalize([x, { type: 'separator' }, y])).toEqual([x, { type: 'separator' }, y])
    expect(normalize([{ type: 'submenu', label: 'Group', items: [x] }])).toEqual([{ type: 'submenu', label: 'Group', items: [x] }])
})
it('selects the final plural form for zero and templates with many forms', () => {
    const message = '{1} One|{2} Two|{3} Three|[0,*] :count records'
    expect(selectedLabel(message, 0)).toBe('0 records')
    expect(selectedLabel(message, 4)).toBe('4 records')
})
