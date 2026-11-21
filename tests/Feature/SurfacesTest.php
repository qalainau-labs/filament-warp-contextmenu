<?php

use Filament\Actions\Action;
use Filament\Actions\BulkAction;
use Filament\Facades\Filament;
use Filament\Infolists\Components\Entry;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Qalainau\FilamentWarpContextMenu\Support\Menus;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Customer;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\EntryPage;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\MenuTable;
use Qalainau\FilamentWarpContextMenu\WarpContextMenuPlugin;

use function Pest\Livewire\livewire;

beforeEach(function () {
    usePanel('admin');
    $this->actingAs(manager());
});

afterEach(function () {
    MenuTable::$configure = null;
});

it('enables page menus by default and permits opting out', function () {
    expect(WarpContextMenuPlugin::make()->hasPages())->toBeTrue();
    expect(WarpContextMenuPlugin::make()->pages(false)->hasPages())->toBeFalse();
});

it('returns visible column capabilities and current native sorting only', function () {
    MenuTable::$configure = fn (Table $table) => $table->columns([
        TextColumn::make('name')->sortable()->toggleable(),
        TextColumn::make('hidden')->hidden(),
        TextColumn::make('toggled')->toggleable(isToggledHiddenByDefault: true),
    ]);
    livewire(MenuTable::class)->call('sortTable', 'name', 'desc')
        ->call('__warpContextMenu', [], 'column')->assertReturned([
            'columns' => ['name' => ['sortable' => true, 'toggleable' => true]], 'sortColumn' => 'name', 'sortDirection' => 'desc',
        ]);
});

it('mirrors only permitted table header actions and native capabilities', function () {
    $record = Customer::create(['name' => 'Before header']);
    MenuTable::$configure = fn (Table $table) => $table->headerActions([
        Action::make('allowed')->action(fn () => Customer::query()->update(['name' => 'Header executed'])),
        Action::make('hidden')->hidden(),
        Action::make('forbidden')->authorize(false),
    ])->filters([SelectFilter::make('name')->options(['Alice' => 'Alice'])]);
    livewire(MenuTable::class)->call('__warpContextMenu', [], 'table')->assertReturned(function ($data) {
        expect(array_column($data['items'], 'name'))->toBe(['allowed']);
        expect($data)->toMatchArray(['selectable' => false, 'filters' => true]);

        return true;
    })->call('mountAction', 'allowed', [], ['table' => true])->assertHasNoErrors();
    expect($record->fresh()->name)->toBe('Header executed');
});

it('respects both table surface opt outs in payloads and client config', function () {
    MenuTable::$configure = fn (Table $table) => $table->contextMenuHeaders(false)->contextMenuTable(false);
    $page = livewire(MenuTable::class);
    $page->call('__warpContextMenu', [], 'column')->assertReturned([]);
    $page->call('__warpContextMenu', [], 'table')->assertReturned([]);
    expect(Menus::clientConfig('record', $page->instance()->getTable()))->toMatchArray(['headers' => false, 'tableMenu' => false]);
});

it('fetches visible entry actions and mounts them through the native schema context', function () {
    view()->addNamespace('warp-contextmenu', __DIR__.'/../views');
    $record = Customer::create(['name' => 'Before entry']);
    $page = livewire(EntryPage::class);
    $page->call('__warpContextMenu', ['infolist.name'], 'entry')->assertReturned(function ($data) {
        expect($data['copyValue'])->toBeTrue();
        expect(array_column($data['items'][0]['items'], 'name'))->toBe(['renameEntry']);
        expect($data['items'][0]['items'][0]['context']['schemaComponent'])->toBe('infolist.name');

        return true;
    })->call('mountAction', 'renameEntry', [], ['schemaComponent' => 'infolist.name']);
    expect($record->fresh()->name)->toBe('Entry renamed');
    $page->call('__warpContextMenu', ['infolist.email'], 'entry')->assertReturned(['items' => [], 'copyValue' => false]);
    $page->call('__warpContextMenu', ['infolist.secret'], 'entry')->assertReturned([]);
    $hiddenChild = collect($page->instance()->getSchema('infolist')->getFlatComponents(withHidden: true))
        ->first(fn ($component) => $component instanceof Entry && $component->getName() === 'nestedSecret');
    expect($hiddenChild)->not->toBeNull();
    $page->call('__warpContextMenu', [$hiddenChild->getKey()], 'entry')->assertReturned([]);
    $page->call('__warpContextMenu', ['infolist.readable'], 'entry')->assertReturned(['items' => [], 'copyValue' => true]);
    Filament::getCurrentPanel()->getPlugin('warp-contextmenu')->pages(false);
    $page->call('__warpContextMenu', ['infolist.name'], 'entry')->assertReturned([]);
});

it('renders native sorting when bundled with a menu prefetch in either order', function () {
    MenuTable::$configure = fn (Table $table) => $table->columns([TextColumn::make('name')->sortable()]);
    foreach ([true, false] as $fetchFirst) {
        $calls = [
            ['method' => '__warpContextMenu', 'params' => [[], 'column']],
            ['method' => 'sortTable', 'params' => ['name', 'desc']],
        ];
        $page = livewire(MenuTable::class)->update($fetchFirst ? $calls : array_reverse($calls));
        expect($page->effects)->toHaveKey('html');
        expect($page->effects['html'])->toContain('aria-sort="descending"');
    }
});

it('returns each surface when prefetches share a Livewire request', function () {
    view()->addNamespace('warp-contextmenu', __DIR__.'/../views');
    Customer::create(['name' => 'Bundled entries']);
    $page = livewire(EntryPage::class)->update([
        ['method' => '__warpContextMenu', 'params' => [[], 'page']],
        ['method' => '__warpContextMenu', 'params' => [['infolist.name'], 'entry']],
        ['method' => '__warpContextMenu', 'params' => [['infolist.email'], 'entry']],
    ]);
    expect($page->effects['returns'][0])->toBe([]);
    expect($page->effects['returns'][1]['copyValue'])->toBeTrue();
    expect($page->effects['returns'][1]['items'][0]['items'][0]['name'])->toBe('renameEntry');
    expect($page->effects['returns'][2])->toBe(['items' => [], 'copyValue' => false]);
});

it('returns bulk actions alongside a table prefetch in one request', function () {
    MenuTable::$configure = fn (Table $table) => $table->toolbarActions([
        BulkAction::make('bulkAction')->label('Bulk action'),
    ])->contextMenuBulkActions();
    $page = livewire(MenuTable::class)->update([
        ['method' => '__warpContextMenu', 'params' => [[], 'table']],
        ['method' => '__warpContextMenu', 'params' => [[], 'bulk']],
    ]);
    expect($page->effects['returns'][0])->toHaveKey('selectable');
    expect($page->effects['returns'][1][0]['name'])->toBe('bulkAction');
});
