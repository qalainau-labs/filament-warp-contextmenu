# Changelog

All notable changes to `qalainau/filament-warp-contextmenu` are documented here.

## [Unreleased]

### Fixed

- On touch screens, in panels using `->spa(hasPrefetching: true)`, lifting the finger after a long press no longer opens the row's link and closes the menu that just opened. With prefetching, Filament's row links use `wire:navigate.hover`, which navigates on the mouse-up event the browser sends after the touch instead of on a click, so the existing click suppression did not catch it. The suppression now also lasts one second from when the finger is lifted, however long the press was.

## [1.0.1] - 2026-11-22

### Fixed

- Menu-only and cell-menu actions work again with Filament 5.12, which only mounts a table action for a record when it is one of the table's record actions. They are still not shown in the row's actions column.
- Lazy-loaded table components (relation managers and table widgets, which Filament loads lazily by default) no longer fail with a 500 error ("Typed property …::$table must not be accessed before initialization") on their first load. This affected every lazy table in the panel, including those without a context menu.

## [1.0.0] - 2026-11-21

### Added

- Row context menus with `$table->contextMenu()`, reusing the table's `recordActions()` or a separate list of native Filament actions. Each action is evaluated per record for visibility, authorization, label, icon, color, badge and disabled reason.
- `ActionGroup` submenus, labeled sections with `->dropdown(false)`, `ContextMenu::separator()`, `contextMenuChecked()` and displayed `keyBindings()`.
- Selected-row menus with the toolbar bulk actions or `contextMenuBulkActions()`, keeping Filament's all-pages selection.
- Cell menus with `Column::contextMenu()`, Copy cell text (`contextMenuCopyCell()`), Copy row, link actions (`contextMenuLinks()`) and copy actions with `contextMenuCopy()`.
- Column-header menus (sort, hide column, copy column; `contextMenuHeaders(false)`) and table-space menus (header actions, select all, deselect, reset filters, reload, copy table; `contextMenuTable(false)`).
- Page menus anywhere outside tables (header actions or `getContextMenuActions()`, copy page link, reload, back, forward, copy selected text; `WarpContextMenuPlugin::make()->pages(false)` turns them off) and infolist entry menus with `Entry::contextMenu()` and `contextMenuCopyValue()`.
- Search inside the menu, including submenus, with `contextMenuKeywords()`.
- Keyboard access (ContextMenu key, Shift+F10, arrows, Home/End, Escape), touch long press and a bottom sheet on phones. Shift + right-click always opens the browser menu.
- Records are looked up again through the table query (tenant-aware); hidden and unauthorized actions are never sent to the browser.
- Filament styling, light and dark mode, RTL and ten languages.
- With Warp Clipboard installed, a Clipboard submenu; `contextMenuClipboard(false)` hides it for one table.
- Laravel Boost guidelines and a development skill.
