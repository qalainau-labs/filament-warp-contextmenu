<?php

namespace Qalainau\FilamentWarpContextMenu\Tests\Fixtures;

use Filament\Actions\Action;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Filament\Widgets\TableWidget;
use Livewire\Attributes\Lazy;

#[Lazy]
class LazyTable extends TableWidget
{
    public bool $contextMenuEnabled = false;

    public function table(Table $table): Table
    {
        $table->query(Customer::query())->columns([TextColumn::make('name')]);

        return $this->contextMenuEnabled
            ? $table->contextMenu([
                Action::make('inspect')->label('Inspect customer')->requiresConfirmation()
                    ->action(fn (Customer $record) => $record->update(['name' => 'Inspected lazy customer'])),
            ])
            : $table;
    }
}
