<?php

namespace Qalainau\FilamentWarpContextMenu\Tests\Fixtures;

use Filament\Panel;
use Filament\PanelProvider;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Resources\CustomerResource;
use Qalainau\FilamentWarpContextMenu\WarpContextMenuPlugin;

class AdminPanelProvider extends PanelProvider
{
    public function panel(Panel $panel): Panel
    {
        return $panel->default()->id('admin')->path('admin')->login()
            ->resources([CustomerResource::class])->plugin(WarpContextMenuPlugin::make()->pages());
    }
}
