import { it, expect } from 'vitest'
import cases from './surface-cases.json'
import { surface, hideColumn } from '../../resources/js/core/surfaces.js'

it.each(cases)('$name', ({ input, expected }) => expect(surface(input)).toBe(expected))
it('hides a grouped toggleable column without changing unrelated or original state', () => {
    const columns = [{ name: 'group', columns: [{ name: 'email', isToggled: true, isToggleable: true }, { name: 'name', isToggled: true, isToggleable: false }] }]
    expect(hideColumn(columns, 'email')[0].columns).toEqual([{ name: 'email', isToggled: false, isToggleable: true }, { name: 'name', isToggled: true, isToggleable: false }])
    expect(hideColumn(columns, 'name')).toEqual(columns)
    expect(columns[0].columns[0].isToggled).toBe(true)
})
