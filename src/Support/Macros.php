<?php

namespace Qalainau\FilamentWarpContextMenu\Support;

use Closure;
use Filament\Actions\Action;
use Filament\Tables\Columns\Column;
use Filament\Tables\Table;
use WeakMap;

/** @internal */
final class Macros
{
    /** @var WeakMap<object, array<string, mixed>>|null */
    private static ?WeakMap $values = null;

    public static function set(object $owner, string $key, mixed $value): void
    {
        self::$values ??= new WeakMap;
        self::$values[$owner] = [...(self::$values[$owner] ?? []), $key => $value];
    }

    public static function get(object $owner, string $key, mixed $default = null): mixed
    {
        return self::$values[$owner][$key] ?? $default;
    }

    public static function register(): void
    {
        Table::macro('contextMenu', function (array|Closure|null $actions = null): Table {
            $self = $this; // @phpstan-ignore variable.undefined
            Macros::set($self, 'enabled', true);
            Macros::set($self, 'record', $actions);

            return $self;
        });
        Table::macro('contextMenuBulkActions', function (array|Closure|null $actions = null): Table {
            $self = $this; // @phpstan-ignore variable.undefined
            Macros::set($self, 'enabled', true);
            Macros::set($self, 'bulkEnabled', true);
            Macros::set($self, 'bulk', $actions);
            if ($actions !== null) {
                Menus::bulkFor($self);
            }

            return $self;
        });
        Table::macro('contextMenuCopyCell', function (bool $condition = true): Table {
            $self = $this; // @phpstan-ignore variable.undefined
            Macros::set($self, 'enabled', true);
            Macros::set($self, 'copyCell', $condition);

            return $self;
        });
        Table::macro('contextMenuLinks', function (bool $condition = true): Table {
            $self = $this; // @phpstan-ignore variable.undefined
            Macros::set($self, 'enabled', true);
            Macros::set($self, 'links', $condition);

            return $self;
        });
        Column::macro('contextMenu', function (array|Closure $actions): Column {
            $self = $this; // @phpstan-ignore variable.undefined
            Macros::set($self, 'actions', $actions);
            $self->extraAttributes(fn () => ['data-warp-context-menu-column' => $self->getName()], merge: true);

            return $self;
        });
        Action::macro('contextMenuChecked', function (bool|Closure $condition = true): Action {
            $self = $this; // @phpstan-ignore variable.undefined
            Macros::set($self, 'checked', $condition);

            return $self;
        });
    }
}
