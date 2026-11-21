<?php

namespace Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Resources;

use Filament\Actions\Action;
use Filament\Actions\EditAction;
use Filament\Resources\Resource;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Customer;

class CustomerResource extends Resource
{
    protected static ?string $model = Customer::class;

    public static function table(Table $table): Table
    {
        return $table->columns([TextColumn::make('name')])->contextMenu([
            Action::make('rename')->label(fn ($record) => 'Rename '.$record->name)->authorize(fn () => auth()->user()?->email !== 'blocked@example.com')->action(fn ($record) => $record->update(['name' => 'Renamed'])),
            EditAction::make(),
        ]);
    }

    public static function getPages(): array
    {
        return ['index' => Pages\ListCustomers::route('/')];
    }
}
