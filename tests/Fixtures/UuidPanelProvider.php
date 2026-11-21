<?php

namespace Qalainau\FilamentWarpContextMenu\Tests\Fixtures;

use Filament\Panel;
use Filament\PanelProvider;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Resources\UuidCustomerResource;
use Qalainau\FilamentWarpContextMenu\WarpContextMenuPlugin;

class UuidPanelProvider extends PanelProvider
{
    public function panel(Panel $panel): Panel
    {
        return $panel->id('uuid')->path('uuid')->login()
            ->tenant(UuidTeam::class)->resources([UuidCustomerResource::class])->plugin(WarpContextMenuPlugin::make()->pages());
    }
}
