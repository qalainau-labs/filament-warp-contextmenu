<?php

namespace Qalainau\FilamentWarpContextMenu\Tests\Fixtures;

use Closure;
use Filament\Actions\Action;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Filament\Widgets\TableWidget;

class MenuTable extends TableWidget
{
    public static ?Closure $configure = null;

    public function table(Table $table): Table
    {
        $table->query(Customer::query())->columns([TextColumn::make('name')])->contextMenu([
            Action::make('rename')->label(fn (Customer $record) => 'Rename '.$record->name)
                ->authorize(fn () => auth()->user()?->email !== 'blocked@example.com')
                ->action(fn (Customer $record) => $record->update(['name' => 'Renamed'])),
        ]);

        return static::$configure ? (static::$configure)($table) : $table;
    }
}
