import { it, expect } from 'vitest'
import cases from './clipboard-cases.json'
import * as clipboard from '../../resources/js/core/clipboard.js'
for (const test of cases) it(test.name, () => {
    const initial = structuredClone(test.items)
    const args = { add: [test.entry, test.limit], keep: [test.value, test.kept, test.limit], edit: [test.value, test.entry, test.limit], remove: [test.value], clear: [], limitItems: [test.limit] }
    const result = test.op === 'switchUser' ? clipboard.switchUser(test.previous, test.next, test.items) : clipboard[test.op](test.items, ...args[test.op])
    expect(result).toEqual(test.expected)
    expect(test.items).toEqual(initial)
})

it('formats clipboard times in the interface locale without changing the stored timestamp', async () => {
    const { relativeTime } = await import('../../resources/js/clipboard.js')
    const now = 1800000000000
    expect(relativeTime(now - 120000, 'ja', now)).toBe('2 分前')
    expect(relativeTime(now - 7200000, 'en', now)).toBe('2 hours ago')
    expect(relativeTime(now - 86400000, 'de', now)).toBe('gestern')
    expect(relativeTime(undefined, 'ja', now)).toBe('')
    expect(relativeTime(now - 120000, 'invalid_locale!', now)).toBe('2 minutes ago')
})
