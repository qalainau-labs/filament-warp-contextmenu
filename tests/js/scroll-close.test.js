import { it, expect } from 'vitest'
import cases from './scroll-close-cases.json'
import { shouldCloseOnScroll } from '../../resources/js/core/scroll.js'

it.each(cases)('$name', test => {
    expect(shouldCloseOnScroll(test)).toBe(test.expected)
})
