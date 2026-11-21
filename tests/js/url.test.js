import { it, expect } from 'vitest'
import cases from './url-cases.json'
import { safeUrl } from '../../resources/js/core/url.js'
it.each(cases)('$name', test => {
    expect(safeUrl(test.value, 'https://example.com/admin')).toEqual(test.expected)
})
