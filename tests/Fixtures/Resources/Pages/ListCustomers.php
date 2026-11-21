<?php

namespace Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Resources\Pages;

use Filament\Actions\Action;
use Filament\Resources\Pages\ListRecords;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Resources\CustomerResource;

class ListCustomers extends ListRecords
{
    protected static string $resource = CustomerResource::class;

    protected function getHeaderActions(): array
    {
        return [Action::make('hiddenHeader')->hidden(), Action::make('nativeHeader')->label('Native header')->requiresConfirmation()->action(fn () => null)];
    }
}
