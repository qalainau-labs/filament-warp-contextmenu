---
name: warp-contextmenu-development
description: Configure and test native Filament actions in Warp Context Menu (qalainau/filament-warp-contextmenu), including row, cell, selected-record and page menus, action search. Use when an installed Filament app needs context menu behavior.
---

# Warp Context Menu

Right-click menus reuse Filament actions and their forms, confirmation dialogs and authorization. Prefer the plugin's macros over writing JavaScript menus. Read the installed package's README at `vendor/qalainau/filament-warp-contextmenu/README.md` for full examples and version-specific signatures.

## Setup

No migration or trait. Publish Filament assets after installation and updates with `php artisan filament:assets`, and register each panel:

```php
use Qalainau\FilamentWarpContextMenu\WarpContextMenuPlugin;

$panel->plugin(WarpContextMenuPlugin::make());
```

Page menus are on by default; disable with `pages(false)`.

## Where to read more

| Task | README section |
| --- | --- |
| Install and register a panel | "Installation" |
| Reuse record actions or create a separate menu | "Row actions" |
| Submenus, sections, checked state and name conflicts | "Row actions" |
| Selection and all-pages bulk actions | "Selected records" |
| Add actions to an ordinary column | "Cell actions" |
| Header actions or custom page actions | "Page actions" |
| Copy cells, rows, links or custom values | "Links and copying" |
| Find nested actions and add keywords | "Search" |
| Empty payloads, key limits and browser escape routes | "Browser menu and empty menus" |
| Optional Warp Clipboard integration | "Clipboard history (Warp Clipboard)" |
| Keyboard shortcuts | "Keyboard" |
| Phone sheets and Back navigation | "Touch" |
| ARIA roles and focus | "Accessibility" |
| Tenant query and action authorization | "Security" |
| Localize the menu | "Translations" |
| Assert Livewire payloads | "Testing" |

## Row menus and groups

```php
use Filament\Actions\Action;
use Filament\Actions\ActionGroup;
use Filament\Actions\EditAction;
use Qalainau\FilamentWarpContextMenu\ContextMenu;

// Reuse the same objects; do not rebuild an action with the same registered name.
$table->recordActions([EditAction::make()])->contextMenu();

// Or register actions only for the context menu.
$table->contextMenu([
    Action::make('copyNumber')
        ->contextMenuCopy(fn ($record) => $record->number)
        ->contextMenuKeywords(['number', '番号']),
    ActionGroup::make([
        Action::make('paid')
            ->contextMenuChecked(fn ($record) => $record->status === 'paid'),
    ]),
    ContextMenu::separator(),
    ActionGroup::make([Action::make('help')->url('https://example.com/help')])
        ->dropdown(false),
]);
```

Use Filament's normal per-record closures for labels, icons, visibility, authorization and disabled state. A disabled action's tooltip is its visible reason. A URL action follows its link; other executable actions mount normally in Filament. Checked state describes the item; add your application's native action callback to change it.

All row and cell action names must be unique, including across groups. A separate action object using an existing table action's name throws `LogicException`. Rename it or reuse the same object. Bulk actions occupy their own namespace.

## Cells, selection and pages

```php
use Filament\Actions\Action;
use Filament\Actions\BulkAction;
use Filament\Tables\Columns\TextColumn;
use Qalainau\FilamentWarpContextMenu\WarpContextMenuPlugin;

TextColumn::make('email')->contextMenu([
    Action::make('emailCustomer')->url(fn ($record) => 'mailto:'.$record->email),
]);

$table->contextMenuBulkActions(); // Existing toolbar bulk actions.
$table->contextMenuBulkActions([BulkAction::make('archive')]); // Supply its callback in your app.

$panel->plugin(WarpContextMenuPlugin::make()->pages());
```

Bulk menus open on selected rows only when at least two records are selected. An unselected row keeps its own actions without changing selection. Preserve Filament's selection state rather than reconstructing record IDs in the browser.

For custom page actions define `public function getContextMenuActions(): array` on the page. No trait is needed. Hidden columns do not contribute cell menus.

## Search and copy

Typing searches labels and `contextMenuKeywords()` across submenus; results show the path. At least eight leaf actions show search immediately. Search visibility is automatic in this version. Escape clears a query before closing. Disabled actions stay searchable.

Cell copy and link actions are enabled by default on configured tables. Disable with `contextMenuCopyCell(false)` or `contextMenuLinks(false)`. A custom `contextMenuCopy()` closure receives the row record and copies its returned value instead of mounting. Hidden or unauthorized actions never enter the payload.

## Clipboard history (Warp Clipboard)

Clipboard history is provided by the separate **Warp Clipboard** plugin. When installed and enabled, it adds a Clipboard submenu to row, selection, page and entry menus.

Use `$table->contextMenuClipboard(false)` to hide that submenu for a table. **Copy row** remains available without Warp Clipboard.

See the [Warp Clipboard README](https://github.com/qalainau-labs/filament-warp-clipboard-docs) for setup and usage.

## Boundaries and tests

Record keys are looked up through the table query again and requests are limited to 100 keys. Tenant scoping and policies belong on the resource; Filament verifies action mounting. Native menus remain accessible with Shift + right-click, in editable fields unless a clipboard picker applies, and inside selected text on tables. Page menus offer Copy selected text. A known empty menu preserves the browser menu; an initially empty async response dismisses the loading menu.

```php
use Filament\Facades\Filament;
use Livewire\Livewire;

// $user, $key and ListInvoices are application fixtures.
$this->actingAs($user);
Filament::setCurrentPanel(Filament::getPanel('admin'));

Livewire::test(ListInvoices::class)
    ->call('__warpContextMenu', [$key], 'record')
    ->assertReturned(fn (array $payload): bool => $payload[$key]['items'][0]['name'] === 'copyNumber');
```

Row payloads contain `items` and `cells` keyed by column name. Bulk and page calls pass `[]` and the corresponding kind. For tenancy tests, set `Filament::setTenant($team, isQuiet: true)` first and verify another tenant's key returns empty `items` and `cells`. Test action effects through normal Filament action tests too. See "Testing" for a complete application example.

## Table surfaces and infolists

Configured tables include column-header menus (sorting, hide column, copy column) and table-space/toolbar/pagination menus (header actions, select page, deselect, reset filters, reload, copy table). Disable with `Table::contextMenuHeaders(false)` or `Table::contextMenuTable(false)`. The commands use Filament’s own APIs and visible DOM values for copying.

Page menus include page actions, page-link copy, reload, Back, Forward, selected-text copy and optional Clipboard. Inputs retain the browser menu or clipboard picker. `Entry::contextMenu(array|Closure)` adds native infolist actions before page commands; Copy value defaults on and `Entry::contextMenuCopyValue(false)` disables it. Hidden entries and actions are excluded. See "Column headers and table space" and "Infolist entries" in the README.
