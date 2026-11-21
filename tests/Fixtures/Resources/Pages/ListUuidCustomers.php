<?php

namespace Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Resources\Pages;

use Filament\Resources\Pages\ListRecords;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Resources\UuidCustomerResource;

class ListUuidCustomers extends ListRecords
{
    protected static string $resource = UuidCustomerResource::class;
}
