export function shouldCloseOnScroll({ sheet, insideMenu, start, current }) {
    return !sheet && !insideMenu && !!start
        && Math.max(Math.abs(current.x - start.x), Math.abs(current.y - start.y)) >= 24
}
