import { it, expect } from 'vitest'
import cases from './clipboard-cases.json'
import * as clipboard from '../../resources/js/core/clipboard.js'
for (const test of cases) it(test.name, () => {
    const initial = structuredClone(test.items)
    const args = { add: [test.entry, test.limit], keep: [test.value, test.kept, test.limit], edit: [test.value, test.entry, test.limit], remove: [test.value], clear: [] }
    const result = test.op === 'switchUser' ? clipboard.switchUser(test.previous, test.next, test.items) : clipboard[test.op](test.items, ...args[test.op])
    expect(result).toEqual(test.expected)
    expect(test.items).toEqual(initial)
})
