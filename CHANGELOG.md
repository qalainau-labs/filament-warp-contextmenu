# Changelog

All notable changes to `qalainau/filament-warp-contextmenu` are documented here.

## [Unreleased]

### Fixed

- Show automatic search only for at least eight developer actions, including submenu children, excluding built-in copy, link and clipboard entries.
- Omit the default Filament ellipsis icon from action groups unless an icon is explicitly configured.

### Added

- `Table::contextMenuClipboard(bool $condition = true)` to hide Copy row and Clipboard from a table's row and cell menus while preserving panel capture and input paste.

- Row context menus using existing Filament `recordActions()` or a separate list of native actions, evaluated per record for visibility, authorization, labels, icons, colors, badges and disabled reasons.
- `ActionGroup` submenus and labeled sections, explicit separators, checked actions and displayed keyboard shortcuts.
- Selected-record menus using toolbar bulk actions or a dedicated list, preserving Filament's all-pages selection.
- Cell menus on standard table columns and optional page menus from header actions or `getContextMenuActions()`.
- Copy cell text, tab-separated visible row values, link addresses and custom action values; open underlying links in a new tab.
- Search across submenu actions with flattened result paths, case and accent folding, extra action keywords and empty-result feedback.
- Opt-in clipboard capture for panel copies, bounded recent history, kept values, named multiline text with add/edit/remove controls, source labels and localized relative times.
- Clipboard paste through input right-click, Ctrl+Shift+V / Command+Shift+V, and a Clipboard submenu; Livewire-compatible input events, per-user and panel browser storage, session-only storage and logout cleanup.
- Keyboard opening and navigation, focus restoration, native browser menu escape routes, touch long press, and mobile bottom sheets with submenu Back navigation.
- Filament styling, light and dark modes, RTL layout, WAI-ARIA menu states, copy announcements and ten interface languages.
- Tenant-scoped table record lookup, hidden-action payload filtering, Filament action mounting and a 100-key request limit.
- Laravel Boost guidelines and development skill, PHPStan macro support, and PHP, JavaScript and browser tests.
