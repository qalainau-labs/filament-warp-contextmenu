<?php

// テストのアプリの storage をプロセスごとに分ける（同時に流すほかのテストの Storage::fake() に消されない。shared/php-test/isolated-storage.php）
require_once __DIR__.'/Support/isolated-storage.php';

use Filament\Facades\Filament;
use Illuminate\Database\Eloquent\Model;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\User;
use Qalainau\FilamentWarpContextMenu\Tests\TestCase;

pest()->extend(TestCase::class)->in('Feature', 'Unit');

function manager(): User
{
    return User::query()->firstOrCreate(['email' => 'manager@example.com'], ['name' => 'Manager']);
}

function usePanel(string $id, ?Model $tenant = null): void
{
    $panel = Filament::getPanel($id);
    Filament::setCurrentPanel($panel);
    Filament::setTenant($tenant, isQuiet: true);
    if ($tenant !== null) {
        foreach ($panel->getResources() as $resource) {
            $resource::registerTenancyModelGlobalScope($panel);
        }
    }
}
