import { it, expect } from 'vitest'
import cases from './search-cases.json'
import { search } from '../../resources/js/core/search.js'
for (const test of cases) it(test.name, () => {
    const result = search(test.items, test.query)
    expect(result.map(item => item.label)).toEqual(test.expected)
    if (test.paths) expect(result.map(item => item.path)).toEqual(test.paths)
})
