## Warp Context Menu (qalainau/filament-warp-contextmenu)

Warp Context Menu adds right-click menus to Filament table rows, cells, selected records and pages using native Filament actions. When this package is installed, reuse the existing actions instead of creating a custom JavaScript menu or duplicating their authorization and modal handling.

- Register `WarpContextMenuPlugin::make()` (`Qalainau\FilamentWarpContextMenu\WarpContextMenuPlugin`) on each panel. Run `php artisan filament:assets` after installation or updates. No migration or Livewire trait.
- Rows: `$table->recordActions([...])->contextMenu()` reuses existing row actions. `contextMenu(array|Closure|null $actions = null)` accepts a separate menu; menu-only actions are registered for Filament mounting without adding visible row buttons.
- Structure: native `ActionGroup` becomes a submenu; `dropdown(false)` becomes a labeled section. `Qalainau\FilamentWarpContextMenu\ContextMenu::separator()` adds a divider. Empty groups and redundant separators disappear.
- Per-record state: use ordinary Filament visibility, authorization, disabled state, tooltip, label, icon, color, badge and key bindings. Disabled actions remain visible with their reason. `contextMenuChecked(bool|Closure $condition = true)` adds a checked state.
- Selected records: `contextMenuBulkActions()` reuses toolbar bulk actions, or accepts `array|Closure|null $actions`. It opens on a selected row when at least two records are selected and preserves Filament's all-pages selection.
- Cells: `TextColumn::make('email')->contextMenu([...])`, also on other table columns. Cell actions precede row actions. Use unique action names across row and cell menus and registered table actions; conflicting names throw a `LogicException`.
- Pages: `WarpContextMenuPlugin::make()` enables header actions and page commands everywhere outside tables; `pages(false)` disables them; a page's `public function getContextMenuActions(): array` overrides them.
- Copy and links: default cell copy and underlying-link actions can be disabled with `contextMenuCopyCell(false)` and `contextMenuLinks(false)`. `Action::make('copyNumber')->contextMenuCopy(fn ($record) => $record->number)` copies a custom value instead of mounting the action.
- Search is built in: typing filters submenu actions too, and menus with at least eight leaf actions show the field immediately. `contextMenuKeywords(array|Closure $keywords)` adds terms. Search visibility is automatic in this version.
- Clipboard history comes from the separate Warp Clipboard plugin. When installed and enabled, it adds a Clipboard submenu.
- `Table::contextMenuClipboard(bool $condition = true)` hides the Clipboard submenu for that table when false. Copy row remains available without Warp Clipboard.
- Record keys are fetched again through the table query, at most 100 per request. Hidden and unauthorized actions are omitted from payloads. Filament checks executable actions again when mounting. Do not replace tenant scoping or policies with client-side checks.
- Keyboard, touch bottom sheets with Back navigation, RTL and ten interface languages are built in. Shift + right-click preserves the browser menu.
- For examples and payload tests, use the `warp-contextmenu-development` skill. See "Installation" in `vendor/qalainau/filament-warp-contextmenu/README.md` for the installed version.

## Table surfaces and infolists

Configured tables include column-header menus (sorting, hide column, copy column) and table-space/toolbar/pagination menus (header actions, select page, deselect, reset filters, reload, copy table). Disable with `Table::contextMenuHeaders(false)` or `Table::contextMenuTable(false)`. The commands use Filament’s own APIs and visible DOM values for copying.

Page menus include page actions, page-link copy, reload, Back, Forward, selected-text copy and optional Clipboard. Inputs retain the browser menu or clipboard picker. `Entry::contextMenu(array|Closure)` adds native infolist actions before page commands; Copy value defaults on and `Entry::contextMenuCopyValue(false)` disables it. Hidden entries and actions are excluded. See "Column headers and table space" and "Infolist entries" in the README.
