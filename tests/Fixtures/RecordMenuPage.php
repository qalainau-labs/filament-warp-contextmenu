<?php

namespace Qalainau\FilamentWarpContextMenu\Tests\Fixtures;

use Filament\Actions\Action;

class RecordMenuPage extends MenuPage
{
    public int $recordId;

    protected ?Action $recordAction = null;

    public function getContextMenuActions(): array
    {
        return [$this->recordAction ??= Action::make('confirm')->record(fn () => Customer::find($this->recordId))
            ->requiresConfirmation()->authorize(fn ($record) => $record?->name === 'Bob')
            ->action(fn ($record) => $record->update(['name' => 'Executed']))];
    }
}
