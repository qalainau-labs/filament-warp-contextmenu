<?php

namespace Qalainau\FilamentWarpContextMenu\Tests\Fixtures;

use Filament\Panel;
use Filament\PanelProvider;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Resources\CustomerResource;
use Qalainau\FilamentWarpContextMenu\WarpContextMenuPlugin;

class TeamPanelProvider extends PanelProvider
{
    public function panel(Panel $panel): Panel
    {
        return $panel->id('team')->path('team')->login()
            ->tenant(Team::class)->resources([CustomerResource::class])->plugin(WarpContextMenuPlugin::make()->pages());
    }
}
