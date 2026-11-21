<?php

namespace Qalainau\FilamentWarpContextMenu\Support;

use Filament\Actions\Action;
use Filament\Actions\ActionGroup;
use Filament\Infolists\Components\Entry;
use Filament\Tables\Contracts\HasTable;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Model;
use Livewire\Component;
use Qalainau\FilamentWarpContextMenu\Separator;

/** @internal */
final class Surfaces
{
    public static function recordTitle(Table $table, Model $record): ?string
    {
        // 5.9 installs a legacy resolver even when no title was configured. Evaluate
        // it before getRecordTitle(), which substitutes the model label for null.
        $title = (function () use ($record) {
            return $this->evaluate($this->recordTitle, ['record' => $record]);
        })->call($table);
        $title ??= filled($attribute = $table->getRecordTitleAttribute()) ? $record->getAttributeValue($attribute) : null;

        return filled($title) ? (trim($table->getRecordTitle($record)) ?: null) : null;
    }

    public static function table(Component&HasTable $component, Table $table, string $kind): array
    {
        if (! Macros::get($table, $kind === 'column' ? 'headers' : 'table', true)) {
            return [];
        }
        if ($kind === 'column') {
            $columns = [];
            foreach ($table->getVisibleColumns() as $column) {
                $columns[$column->getName()] = ['sortable' => $column->isSortable(), 'toggleable' => $column->isToggleable()];
            }

            return ['columns' => $columns, 'sortColumn' => $component->getTableSortColumn(), 'sortDirection' => $component->getTableSortDirection()];
        }

        return ['items' => Menus::serialize($table->getHeaderActions()), 'selectable' => $table->isSelectionEnabled(), 'filters' => $table->getFilters() !== []];
    }

    public static function entryActions(Entry $entry): array
    {
        $actions = $entry->evaluate(Macros::get($entry, 'actions', []));
        $flat = [];
        foreach ($actions as $action) {
            if ($action instanceof Separator) {
                continue;
            }
            if ($action instanceof ActionGroup) {
                $entry->prepareActionGroup($action);
                array_push($flat, ...array_values($action->getFlatActions()));
            } elseif ($action instanceof Action) {
                $flat[] = $entry->prepareAction($action);
            }
        }
        Macros::set($entry, 'resolvedActions', $actions);

        return $flat;
    }

    public static function entry(Component $component, mixed $key, bool $enabled): array
    {
        if (! $enabled || ! is_string($key) || ! method_exists($component, 'getSchemaComponent')) {
            return [];
        }
        // Filament resolves through visible schemas only, including hidden parents.
        $entry = $component->getSchemaComponent($key);
        if (! $entry instanceof Entry || ! $entry->isVisible()) {
            return [];
        }
        $entry->getActions();

        return ['items' => Menus::serialize(Macros::get($entry, 'resolvedActions', [])), 'copyValue' => Macros::get($entry, 'copyValue', true)];
    }
}
