<?php

use Filament\Facades\Filament;
use Qalainau\FilamentWarpContextMenu\Support\Menus;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Customer;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\MenuPage;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Resources\Pages\ListCustomers;

use function Pest\Livewire\livewire;

beforeEach(function () {
    usePanel('admin');
    $this->actingAs(manager());
    view()->addNamespace('warp-contextmenu', __DIR__.'/../views');
});

it('retrieves and mounts custom page actions with no user trait', function () {
    $record = Customer::create(['name' => 'Before']);
    $page = livewire(MenuPage::class)->call('__warpContextMenu', [], 'page')->assertReturned(fn ($items) => $items[0]['name'] === 'pageAction');
    $page->call('mountAction', 'pageAction')->call('callMountedAction');
    expect($record->fresh()->name)->toBe('Page confirmed');
});

it('uses cached header actions when no custom page method exists', function () {
    $page = livewire(ListCustomers::class);
    expect(Menus::fetch($page->instance(), [], 'page')[0]['name'])->toBe('nativeHeader');
});

it('requires the pages setting and respects pages(false)', function () {
    Filament::getCurrentPanel()->getPlugin('warp-contextmenu')->pages(false);
    livewire(MenuPage::class)->call('__warpContextMenu', [], 'page')->assertReturned([]);
});

it('retrieves and mounts a child of a native header action group', function () {
    $record = Customer::create(['name' => 'Before header']);
    ListCustomers::$groupHeader = true;
    try {
        livewire(ListCustomers::class)->call('__warpContextMenu', [], 'page')->assertReturned(function ($items) {
            expect($items[0])->toMatchArray(['type' => 'submenu', 'label' => 'Header group']);
            expect($items[0]['items'][0])->toMatchArray(['name' => 'headerChild']);

            return true;
        })->call('mountAction', 'headerChild');
        expect($record->fresh()->name)->toBe('Header child');
    } finally {
        ListCustomers::$groupHeader = false;
    }
});
