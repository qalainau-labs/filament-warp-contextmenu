export function position(point, size, viewport, rtl = false, submenu = false) {
    const margin = 8
    let x = rtl ? point.x - size.width : point.x
    let y = point.y
    let maxHeight = Math.max(0, viewport.height - margin * 2)
    if (submenu) {
        const left = (point.left ?? point.x) - size.width
        const right = point.right ?? point.x
        const fitsLeft = left >= margin
        const fitsRight = right + size.width <= viewport.width - margin
        if (rtl ? fitsLeft : fitsRight) x = rtl ? left : right
        else if (rtl ? fitsRight : fitsLeft) x = rtl ? right : left
        else {
            x = Math.max(margin, Math.min(x, viewport.width - size.width - margin))
            const below = Math.max(0, viewport.height - margin - (point.bottom ?? point.y))
            const above = Math.max(0, point.y - margin)
            const openBelow = size.height <= below || (size.height > above && below >= above)
            maxHeight = openBelow ? below : above
            y = openBelow ? (point.bottom ?? point.y) : point.y - Math.min(size.height, maxHeight)
            return { x, y: Math.max(margin, y), maxHeight }
        }
    }
    if (!submenu && x + size.width > viewport.width - margin) x = (submenu ? point.left ?? point.x : point.x) - size.width
    if (!submenu && x < margin) x = submenu ? point.right ?? point.x : margin
    if (y + size.height > viewport.height - margin) y = point.y - size.height
    return {
        x: Math.max(margin, Math.min(x, viewport.width - size.width - margin)),
        y: Math.max(margin, y),
        maxHeight,
    }
}

export function normalize(items) {
    const result = []
    for (let item of items) {
        if (item.items) {
            item = { ...item, items: normalize(item.items) }
            if (!item.items.length) continue
        }
        if (item.type === 'separator' && (!result.length || result.at(-1).type === 'separator')) continue
        result.push(item)
    }
    if (result.at(-1)?.type === 'separator') result.pop()
    return result
}

export function navigate(items, index, key) {
    const enabled = items.map((item, i) => !item.disabled && ['item', 'submenu'].includes(item.type) ? i : -1).filter(i => i >= 0)
    if (!enabled.length) return -1
    if (key === 'Home') return enabled[0]
    if (key === 'End') return enabled.at(-1)
    const current = enabled.indexOf(index)
    if (current < 0) return key === 'ArrowUp' ? enabled.at(-1) : enabled[0]
    return enabled[(current + (key === 'ArrowUp' ? -1 : 1) + enabled.length) % enabled.length]
}

export function typeahead(items, query, index = -1) {
    for (let offset = 1; offset <= items.length; offset++) {
        const i = (index + offset) % items.length
        if (!items[i].disabled && ['item', 'submenu'].includes(items[i].type) && (items[i].label ?? '').toLocaleLowerCase().startsWith(query.toLocaleLowerCase())) return i
    }
    return -1
}

export function shortcut(bindings, mac = false) {
    const binding = Array.isArray(bindings) ? bindings[0] : bindings
    if (!binding) return ''
    return binding.split('+').map(key => {
        const lower = key.toLowerCase()
        if (['mod', 'cmd', 'meta'].includes(lower)) return mac ? '⌘' : 'Ctrl'
        if (['ctrl', 'control'].includes(lower)) return mac ? '⌃' : 'Ctrl'
        if (lower === 'shift') return mac ? '⇧' : 'Shift'
        if (['alt', 'option'].includes(lower)) return mac ? '⌥' : 'Alt'
        return key.toUpperCase()
    }).join(mac ? '' : '+')
}

export function longPress(start, current, elapsed, scrolling = false) {
    return !scrolling && elapsed >= 500 && Math.hypot(current.x - start.x, current.y - start.y) <= 10
}

export function safeTriangle(point, origin, edgeTop, edgeBottom) {
    const cross = (a, b, c) => (a.x - c.x) * (b.y - c.y) - (b.x - c.x) * (a.y - c.y)
    const a = cross(point, origin, edgeTop), b = cross(point, edgeTop, edgeBottom), c = cross(point, edgeBottom, origin)
    return !((a < 0 || b < 0 || c < 0) && (a > 0 || b > 0 || c > 0))
}

export function selectedLabel(template, count, locale = 'en') {
    const parts = template.split('|')
    return (parts[count === 1 ? 0 : parts.length - 1] ?? '').replace(/^(\{[^}]+\}|\[[^\]]+\])\s*/, '').replaceAll(':count', new Intl.NumberFormat(locale.replaceAll('_', '-')).format(count))
}
