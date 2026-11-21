import { it, expect } from 'vitest'
import cases from './keyboard-target-cases.json'
import { keyboardTarget } from '../../resources/js/core/surfaces.js'

it.each(cases)('$name', ({ input, expected }) => expect(keyboardTarget(input)).toBe(expected))
