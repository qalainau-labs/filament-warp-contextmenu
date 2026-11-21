import { it, expect } from 'vitest'
import cases from './search-visibility-cases.json'
import { shouldShowSearch } from '../../resources/js/core/search.js'

it.each(cases)('$name', test => {
    expect(shouldShowSearch(test.items)).toBe(test.expected)
})
