export const fold = value => String(value ?? '').normalize('NFD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC').toLocaleLowerCase()

export function flatten(items, path = [], keywords = []) {
    return items.flatMap(item => item.items
        ? flatten(item.items, item.label ? [...path, item.label] : path, [...keywords, ...(item.keywords ?? [])])
        : item.type === 'item' ? [{ ...item, keywords: [...keywords, ...(item.keywords ?? [])], path: path.join(' › ') }] : [])
}

export function search(items, query) {
    const needle = fold(query)
    return flatten(items).filter(item => fold([item.label, item.path, ...(item.keywords ?? [])].join(' ')).includes(needle))
}
