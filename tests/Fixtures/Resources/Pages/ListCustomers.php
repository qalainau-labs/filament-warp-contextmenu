<?php

namespace Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Resources\Pages;

use Filament\Actions\Action;
use Filament\Actions\ActionGroup;
use Filament\Resources\Pages\ListRecords;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Customer;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Resources\CustomerResource;

class ListCustomers extends ListRecords
{
    protected static string $resource = CustomerResource::class;

    public static bool $groupHeader = false;

    protected function getHeaderActions(): array
    {
        if (static::$groupHeader) {
            return [ActionGroup::make([Action::make('headerChild')->action(fn () => Customer::query()->update(['name' => 'Header child']))])->label('Header group')];
        }

        return [Action::make('hiddenHeader')->hidden(), Action::make('nativeHeader')->label('Native header')->requiresConfirmation()->action(fn () => null)];
    }
}
