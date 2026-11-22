<?php

namespace Qalainau\FilamentWarpContextMenu\Support;

use Filament\Actions\Action;
use Filament\Actions\ActionGroup;
use Filament\Actions\BulkAction;
use Filament\Actions\Contracts\HasActions;
use Filament\Facades\Filament;
use Filament\Support\Facades\FilamentAsset;
use Filament\Tables\Contracts\HasTable;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Gate;
use Illuminate\View\ComponentAttributeBag;
use Livewire\Component;
use LogicException;
use Qalainau\FilamentWarpContextMenu\Separator;
use Qalainau\FilamentWarpContextMenu\WarpContextMenuPlugin;
use Qalainau\FilamentWarpContextMenu\WarpContextMenuServiceProvider;

/** @internal */
final class Menus
{
    public static function enabled(Table $table): bool
    {
        return Macros::get($table, 'enabled', false) || collect($table->getColumns())->contains(fn ($column) => Macros::get($column, 'actions') !== null);
    }

    /** Resolve once per table, including closures, before both menu retrieval and native mounting. */
    public static function prepare(Table $table): array
    {
        if (($prepared = Macros::get($table, 'prepared')) !== null) {
            return $prepared;
        }

        $record = $table->evaluate(Macros::get($table, 'record')) ?? $table->getRecordActions();
        $bulk = Macros::get($table, 'bulkEnabled', false) ? self::bulkFor($table) : [];
        $cells = [];
        $seen = [];
        self::register($table, $record, $seen);
        foreach ($table->getColumns() as $column) {
            if (Macros::get($column, 'actions') === null || $column->isHidden() || $column->isToggledHidden()) {
                continue;
            }
            $cells[$column->getName()] = $table->evaluate(Macros::get($column, 'actions'));
            self::register($table, $cells[$column->getName()], $seen);
        }
        self::register($table, $bulk, $seen, bulk: true);
        $prepared = compact('record', 'bulk', 'cells');
        Macros::set($table, 'prepared', $prepared);

        return $prepared;
    }

    /**
     * Filament 5.12 only resolves a table action with a record when it is one of the table's record actions
     * (or a column's action). Menu-only and cell-menu actions stay out of the visible actions column, so they
     * are added to the record actions only while Filament resolves them, and removed again afterwards.
     *
     * @template T
     *
     * @param  \Closure(): T  $callback
     * @return T
     */
    public static function whileResolvable(Component $component, \Closure $callback): mixed
    {
        $restore = self::makeResolvable($component);
        try {
            return $callback();
        } finally {
            $restore();
        }
    }

    /** Add the menu's record and cell actions to the record actions; the returned closure puts the list back. */
    public static function makeResolvable(Component $component): \Closure
    {
        if (! $component instanceof HasTable || ! self::enabled($table = $component->getTable())) {
            return static function (): void {};
        }
        $prepared = self::prepare($table);
        $flat = $table->getFlatRecordActions();
        $extra = [];
        foreach ([$prepared['record'], ...array_values($prepared['cells'])] as $actions) {
            foreach ($actions as $action) {
                foreach ($action instanceof ActionGroup ? $action->getFlatActions() : [$action] as $item) {
                    if ($item instanceof Action && ! in_array($item, $flat, true) && ! in_array($item, $extra, true)) {
                        $extra[] = $item;
                    }
                }
            }
        }
        if ($extra === []) {
            return static function (): void {};
        }
        $original = (fn (): array => $this->recordActions)->call($table);
        (function (array $actions): void {
            $this->recordActions = $actions;
        })->call($table, [...$original, ...$extra]);

        return static function () use ($table, $original): void {
            (function (array $actions): void {
                $this->recordActions = $actions;
            })->call($table, $original);
        };
    }

    public static function bulkFor(Table $table): array
    {
        if (($actions = Macros::get($table, 'resolvedBulk')) !== null) {
            return $actions;
        }
        $actions = $table->evaluate(Macros::get($table, 'bulk'));
        if ($actions === null) {
            $actions = self::onlyBulkActions($table->getToolbarActions());
        }
        $seen = [];
        self::register($table, $actions, $seen, bulk: true);
        Macros::set($table, 'resolvedBulk', $actions);

        return $actions;
    }

    private static function onlyBulkActions(array $actions): array
    {
        $bulk = [];
        foreach ($actions as $action) {
            if ($action instanceof BulkAction) {
                $bulk[] = $action;
            } elseif ($action instanceof ActionGroup) {
                $children = self::onlyBulkActions($action->getActions());
                if ($children !== []) {
                    $bulk[] = (clone $action)->actions($children);
                }
            }
        }

        return $bulk;
    }

    private static function register(Table $table, array $actions, array &$seen, bool $bulk = false): void
    {
        foreach ($actions as $action) {
            if ($action instanceof Separator) {
                continue;
            }
            if (! $action instanceof Action && ! $action instanceof ActionGroup) {
                throw new LogicException('Warp Context Menu: expected a Filament Action, ActionGroup or ContextMenu::separator().');
            }
            $action->table($table);
            if ($action instanceof ActionGroup) {
                self::register($table, $action->getActions(), $seen, $bulk);

                continue;
            }
            if ($bulk && ! $action instanceof BulkAction) {
                throw new LogicException('Warp Context Menu: expected a Filament action (BulkAction for selected records).');
            }
            $key = ($bulk ? 'bulk:' : 'record:').$action->getName();
            if (isset($seen[$key])) {
                throw new LogicException("Warp Context Menu: duplicate action name [{$action->getName()}] in row, cell or bulk menus.");
            }
            $seen[$key] = true;
            $existing = $bulk ? $table->getBulkAction($action->getName()) : $table->getAction($action->getName());
            if ($existing && $existing !== $action) {
                throw new LogicException("Warp Context Menu: action name [{$action->getName()}] conflicts with a registered table action.");
            }
            // cacheAction is protected; binding keeps registration out of the visible action columns.
            (function (Action $action): void {
                $this->cacheAction($action);
            })->call($table, $action);
        }
    }

    public static function pageActions(Component $component): array
    {
        if (! $component instanceof HasActions || ! self::pagesEnabled()) {
            return [];
        }
        $actions = method_exists($component, 'getContextMenuActions') ? $component->getContextMenuActions()
            : (method_exists($component, 'getCachedHeaderActions') ? $component->getCachedHeaderActions() : []);
        foreach ($actions as $action) {
            if ($action instanceof Separator) {
                continue;
            }
            $action->livewire($component);
            foreach ($action instanceof ActionGroup ? $action->getFlatActions() : [$action] as $item) {
                if (method_exists($component, 'cacheAction')) {
                    $component->cacheAction($item);
                }
            }
        }

        return $actions;
    }

    private static function pagesEnabled(): bool
    {
        $panel = Filament::getCurrentPanel();

        $plugin = $panel?->hasPlugin('warp-contextmenu') ? $panel->getPlugin('warp-contextmenu') : null;

        return $plugin instanceof WarpContextMenuPlugin && $plugin->hasPages();
    }

    public static function fetch(Component $component, array $keys = [], string $kind = 'record'): array
    {
        if ($kind === 'entry') {
            return Surfaces::entry($component, $keys[0] ?? null, self::pagesEnabled());
        }
        if ($kind === 'page') {
            return self::serialize(self::pageActions($component));
        }
        if (! $component instanceof HasTable || ! self::enabled($table = $component->getTable())) {
            return [];
        }
        if ($kind === 'column' || $kind === 'table') {
            return Surfaces::table($component, $table, $kind);
        }
        $prepared = self::prepare($table);
        if ($kind === 'bulk') {
            return self::serialize($prepared['bulk']);
        }
        if ($kind !== 'record') {
            return [];
        }
        $result = [];
        foreach (array_slice(array_values($keys), 0, 100) as $key) {
            if (! is_string($key) && ! is_int($key)) {
                continue;
            }
            $record = $component->getTableRecord((string) $key);
            $result[(string) $key] = ['items' => [], 'cells' => []];
            if (! $record) {
                continue;
            }
            $result[(string) $key]['title'] = $record instanceof Model ? Surfaces::recordTitle($table, $record) : null;
            $result[(string) $key]['items'] = self::serialize($prepared['record'], $record);
            foreach ($prepared['cells'] as $column => $actions) {
                $result[(string) $key]['cells'][$column] = self::serialize($actions, $record);
            }
        }

        return $result;
    }

    public static function serialize(array $actions, Model|array|null $record = null): array
    {
        $items = [];
        foreach ($actions as $action) {
            if ($action instanceof Separator) {
                $items[] = ['type' => 'separator'];

                continue;
            }
            // Preserve the unevaluated value, including record resolver closures.
            $originalRecord = (function () {
                return $this->record;
            })->call($action);
            try {
                if ($record !== null) {
                    $action->record($record);
                }
                if (! $action->isVisible() || ($action instanceof Action && ! $action->isAuthorized())) {
                    continue;
                }
                if ($action instanceof ActionGroup) {
                    $children = self::serialize($action->getActions(), $record);
                    if ($children !== []) {
                        $items[] = ['type' => $action->hasDropdown() ? 'submenu' : 'section', 'label' => self::text($action->getLabel()), 'icon' => self::icon($action->getBaseIcon()), 'items' => $children];
                    }

                    continue;
                }
                if (Macros::get($action, 'copy') !== null && $record instanceof Model) {
                    $policy = Gate::getPolicyFor($record);
                    if ($policy && method_exists($policy, 'view') && ! Gate::allows('view', $record)) {
                        continue;
                    }
                }
                $items[] = [
                    'type' => 'item', 'name' => $action->getName(), 'label' => self::text($action->getLabel()),
                    'icon' => self::icon($action->getGroupedIcon() ?? $action->getIcon()), 'color' => $action->getColor(),
                    'disabled' => $action->isDisabled(), 'tooltip' => self::text($action->getTooltip()),
                    'badge' => self::text($action->getBadge()), 'shortcut' => $action->getKeyBindings(),
                    'checked' => (bool) $action->evaluate(Macros::get($action, 'checked', false)),
                    'checkable' => Macros::get($action, 'checked') !== null,
                    'url' => $action->getUrl(), 'newTab' => $action->shouldOpenUrlInNewTab(),
                    'keywords' => $action->evaluate(Macros::get($action, 'keywords', [])),
                    'copyValue' => Macros::get($action, 'copy') !== null ? (string) $action->evaluate(Macros::get($action, 'copy')) : null,
                    'context' => $action->getContext(), 'arguments' => $action->getArguments(),
                ];
            } finally {
                $action->record($originalRecord);
            }
        }

        return self::normalize($items);
    }

    public static function normalize(array $items): array
    {
        $clean = [];
        foreach ($items as $item) {
            if ($item['type'] === 'separator' && ($clean === [] || end($clean)['type'] === 'separator')) {
                continue;
            }
            $clean[] = $item;
        }
        if ($clean !== [] && end($clean)['type'] === 'separator') {
            array_pop($clean);
        }

        return $clean;
    }

    private static function text(mixed $value): ?string
    {
        return $value === null ? null : trim((string) $value);
    }

    private static function icon(mixed $icon): ?string
    {
        return $icon ? \Filament\Support\generate_icon_html($icon, attributes: new ComponentAttributeBag(['class' => 'fi-icon']))?->toHtml() : null;
    }

    public static function clientConfig(string $kind, ?Table $table = null): array
    {
        return [
            'clipboardMenu' => $table ? Macros::get($table, 'clipboard', true) : true,
            'headers' => $table ? Macros::get($table, 'headers', true) : false,
            'tableMenu' => $table ? Macros::get($table, 'table', true) : false,
            'kind' => $kind,
            'copyCell' => $table ? Macros::get($table, 'copyCell', true) : false,
            'links' => $table ? Macros::get($table, 'links', true) : false,
            'bulk' => $table ? Macros::get($table, 'bulkEnabled', false) : false,
            'locale' => app()->getLocale(),
            'selectedCount' => __('filament-tables::table.selection_indicator.selected_count'),
            'messages' => __('warp-contextmenu::contextmenu'),
            'css' => FilamentAsset::getStyleHref('warp-contextmenu', WarpContextMenuServiceProvider::$assetPackage),
        ];
    }
}
