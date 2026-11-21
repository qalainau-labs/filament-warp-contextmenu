<?php

namespace Qalainau\FilamentWarpContextMenu\Tests\Fixtures;

use Filament\Actions\Action;
use Filament\Pages\Page;

class MenuPage extends Page
{
    protected string $view = 'warp-contextmenu::test-page';

    public function getContextMenuActions(): array
    {
        return [Action::make('hiddenHeader')->hidden(), Action::make('pageAction')->label('Page action')->requiresConfirmation()->action(fn () => Customer::query()->update(['name' => 'Page confirmed']))];
    }
}
