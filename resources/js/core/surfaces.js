// Table boundaries take precedence over page surfaces, including opted-out tables.
export function surface({ table, record, header, entry, pages, enabled, headers = true, tableMenu = true }) {
    if (table) {
        if (!enabled) return null
        if (record) return 'record'
        if (header) return headers ? 'column' : null
        return tableMenu ? 'table' : null
    }
    return pages ? (entry ? 'entry' : 'page') : null
}

export function hideColumn(columns, name) {
    return columns.map(column => column.columns
        ? { ...column, columns: hideColumn(column.columns, name) }
        : column.name === name && column.isToggleable !== false ? { ...column, isToggled: false } : { ...column })
}
