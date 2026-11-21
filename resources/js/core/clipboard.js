// All operations return new arrays; storage and the current user belong to the adapter.
export function limitItems(items, limit = 10) {
    const unique = items.filter((item, index) => typeof item.value === 'string' && item.value.length <= 5000 && item.value.trim() && items.findIndex(other => other.value === item.value) === index)
    return [...unique.filter(item => item.kept), ...unique.filter(item => !item.kept).slice(0, Math.max(0, limit))]
}
export function add(items, entry, limit = 10) {
    if (typeof entry.value !== 'string' || entry.value.length > 5000 || !entry.value.trim()) return items
    const previous = items.find(item => item.value === entry.value)
    return limitItems([{ ...previous, ...entry, kept: entry.kept ?? previous?.kept ?? false }, ...items.filter(item => item.value !== entry.value)], limit)
}
export function keep(items, value, kept, limit = 10) {
    return limitItems(items.map(item => item.value === value ? { ...item, kept } : item), limit)
}
export function edit(items, value, entry, limit = 10) {
    if (typeof entry.value !== 'string' || entry.value.length > 5000 || !entry.value.trim()) return items
    const previous = items.find(item => item.value === value)
    return previous ? add(items.filter(item => item.value !== value), { ...previous, ...entry }, limit) : items
}
export const remove = (items, value) => items.filter(item => item.value !== value)
export const clear = items => items.filter(item => item.kept)
export const switchUser = (previous, next, items) => previous === next ? items : []
