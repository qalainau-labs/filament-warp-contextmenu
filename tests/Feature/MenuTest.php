<?php

use Filament\Actions\Action;
use Filament\Actions\ActionGroup;
use Filament\Actions\BulkAction;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\View\ViewException;
use Qalainau\FilamentWarpContextMenu\ContextMenu;
use Qalainau\FilamentWarpContextMenu\Support\Menus;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Customer;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\MenuTable;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\User;

use function Pest\Livewire\livewire;

beforeEach(function () {
    usePanel('admin');
    $this->actingAs(manager());
    $this->record = Customer::create(['name' => 'Alice']);
    MenuTable::$configure = null;
});
afterEach(fn () => MenuTable::$configure = null);

it('evaluates all action properties for each record without disclosing hidden names', function () {
    $other = Customer::create(['name' => 'Bob']);
    MenuTable::$configure = fn (Table $table) => $table->contextMenu([
        Action::make('status')->label(fn ($record) => $record->name)->disabled(fn ($record) => $record->name === 'Bob')
            ->tooltip(fn ($record) => $record->name === 'Bob' ? 'Already paid' : null)
            ->contextMenuChecked(fn ($record) => $record->name === 'Alice')->icon('heroicon-o-flag')
            ->color(fn ($record) => $record->name === 'Alice' ? 'success' : 'danger')->badge('2')->keyBindings(['mod+e'])
            ->url(fn ($record) => 'https://example.com/'.$record->id)->openUrlInNewTab(),
        Action::make('secretName')->label('Secret label')->visible(false),
        Action::make('forbidden')->authorize(false),
    ]);
    livewire(MenuTable::class)->call('__warpContextMenu', [$this->record->id, $other->id])->assertReturned(function ($data) use ($other) {
        expect($data[$this->record->id]['items'][0])->toMatchArray(['label' => 'Alice', 'disabled' => false, 'checked' => true, 'color' => 'success', 'badge' => '2', 'newTab' => true, 'shortcut' => ['mod+e']]);
        expect($data[$other->id]['items'][0])->toMatchArray(['label' => 'Bob', 'disabled' => true, 'tooltip' => 'Already paid', 'checked' => false]);
        expect(json_encode($data))->not->toContain('secretName', 'Secret label', 'forbidden');

        return true;
    });
});

it('turns groups into submenus and sections and removes empty separators', function () {
    MenuTable::$configure = fn ($table) => $table->contextMenu([
        ContextMenu::separator(),
        ActionGroup::make([Action::make('a')])->label('Status'),
        ContextMenu::separator(), ContextMenu::separator(),
        ActionGroup::make([Action::make('b')])->label('Share')->dropdown(false),
        ActionGroup::make([Action::make('hidden')->hidden()])->label('Empty'),
        ContextMenu::separator(),
    ]);
    livewire(MenuTable::class)->call('__warpContextMenu', [$this->record->id])->assertReturned(function ($data) {
        expect(array_column($data[$this->record->id]['items'], 'type'))->toBe(['submenu', 'separator', 'section']);

        return true;
    });
});

it('registers menu-only actions and mounts them through Filament', function () {
    $test = livewire(MenuTable::class);
    expect($test->instance()->getTable()->getRecordActions())->toBe([]);
    $test->call('mountAction', 'rename', [], ['table' => true, 'recordKey' => (string) $this->record->id]);
    expect($this->record->fresh()->name)->toBe('Renamed');
});

it('does not expose or mount an unauthorized action', function () {
    $this->actingAs(User::create(['name' => 'Blocked', 'email' => 'blocked@example.com']));
    livewire(MenuTable::class)->call('__warpContextMenu', [$this->record->id])->assertReturned([$this->record->id => ['items' => [], 'cells' => []]])
        ->call('mountAction', 'rename', [], ['table' => true, 'recordKey' => (string) $this->record->id])->assertSet('mountedActions', []);
    expect($this->record->fresh()->name)->toBe('Alice');
});

it('preserves confirmation modals and runs only after confirmation', function () {
    MenuTable::$configure = fn ($table) => $table->contextMenu([Action::make('confirm')->requiresConfirmation()->action(fn ($record) => $record->update(['name' => 'Confirmed']))]);
    $test = livewire(MenuTable::class)->call('mountAction', 'confirm', [], ['table' => true, 'recordKey' => (string) $this->record->id]);
    expect($this->record->fresh()->name)->toBe('Alice');
    $test->call('callMountedAction');
    expect($this->record->fresh()->name)->toBe('Confirmed');
});

it('exposes configured cell actions separately and keeps registration out of visible row actions', function () {
    MenuTable::$configure = fn ($table) => $table->columns([TextColumn::make('name')->contextMenu([Action::make('mail')->url(fn ($record) => 'mailto:'.$record->name)])])->contextMenuCopyCell(false)->contextMenuLinks(false);
    $test = livewire(MenuTable::class)->call('__warpContextMenu', [$this->record->id])->assertReturned(function ($data) {
        expect($data[$this->record->id]['cells']['name'][0]['url'])->toBe('mailto:Alice');

        return true;
    });
    expect($test->instance()->getTable()->getRecordActions())->toBe([]);
    expect(Menus::clientConfig('record', $test->instance()->getTable()))->toMatchArray(['copyCell' => false, 'links' => false]);
});

it('evaluates bulk visibility and authorization and uses the native selection', function () {
    MenuTable::$configure = fn ($table) => $table->toolbarActions([
        BulkAction::make('archive')->action(fn ($records) => $records->each->update(['name' => 'Archived'])),
        BulkAction::make('secret')->visible(false), BulkAction::make('denied')->authorize(false),
    ])->contextMenuBulkActions();
    livewire(MenuTable::class)->call('__warpContextMenu', [], 'bulk')->assertReturned(fn ($data) => array_column($data, 'name') === ['archive'])
        ->set('selectedTableRecords', [(string) $this->record->id])->call('mountAction', 'archive', [], ['table' => true, 'bulk' => true]);
    expect($this->record->fresh()->name)->toBe('Archived');
});

it('limits requests to one hundred keys and returns empty results for missing keys', function () {
    $keys = range(1000, 1100);
    livewire(MenuTable::class)->call('__warpContextMenu', $keys)->assertReturned(function ($data) {
        expect($data)->toHaveCount(100)->and($data[1000])->toBe(['items' => [], 'cells' => []]);

        return true;
    });
});

it('rejects conflicting names between row and cell actions', function () {
    MenuTable::$configure = fn ($table) => $table->columns([TextColumn::make('name')->contextMenu([Action::make('rename')])]);
    livewire(MenuTable::class);
})->throws(ViewException::class, 'duplicate action name');

it('supports mirroring record actions and closure configuration', function () {
    MenuTable::$configure = fn ($table) => $table->recordActions([Action::make('native')])->contextMenu()->contextMenuBulkActions(fn () => [BulkAction::make('bulk')]);
    livewire(MenuTable::class)->call('__warpContextMenu', [$this->record->id])->assertReturned(fn ($data) => $data[$this->record->id]['items'][0]['name'] === 'native');
});

it('does not serve tables that have no context menu configuration', function () {
    $table = Table::make(livewire(MenuTable::class)->instance())->query(Customer::query());
    expect(Menus::enabled($table))->toBeFalse();
});

it('keeps retrieval renderless and does not attach a magic public method', function () {
    $test = livewire(MenuTable::class)->call('__warpContextMenu', [$this->record->id]);
    expect(method_exists($test->instance(), '__warpContextMenu'))->toBeFalse();
    expect($test->effects)->not->toHaveKey('html');
});

it('rechecks authorization after a confirmation modal was opened', function () {
    MenuTable::$configure = fn ($table) => $table->contextMenu([
        Action::make('guarded')->requiresConfirmation()
            ->authorize(fn () => auth()->user()?->email !== 'blocked@example.com')
            ->action(fn ($record) => $record->update(['name' => 'Should not run'])),
    ]);
    $test = livewire(MenuTable::class)->call('mountAction', 'guarded', [], ['table' => true, 'recordKey' => (string) $this->record->id]);
    $blocked = manager();
    $blocked->update(['email' => 'blocked@example.com']);
    $this->actingAs($blocked);
    $test->call('callMountedAction');
    expect($this->record->fresh()->name)->toBe('Alice');
});

it('mounts cell-only actions after hydration without a table contextMenu call', function () {
    // Build a fresh, entirely unconfigured table so only the column enables it.
    MenuTable::$configure = fn ($table) => Table::make($table->getLivewire())->query(Customer::query())->columns([
        TextColumn::make('name')->contextMenu([
            Action::make('cellOnly')->requiresConfirmation()->action(fn ($record) => $record->update(['name' => 'Cell confirmed'])),
        ]),
    ]);
    livewire(MenuTable::class)->call('mountAction', 'cellOnly', [], ['table' => true, 'recordKey' => (string) $this->record->id])->call('callMountedAction');
    expect($this->record->fresh()->name)->toBe('Cell confirmed');
});

it('enables selection for bulk actions that only exist in the context menu', function () {
    MenuTable::$configure = fn ($table) => $table->contextMenuBulkActions([BulkAction::make('onlyBulk')]);
    $test = livewire(MenuTable::class);
    expect($test->instance()->getTable()->isSelectionEnabled())->toBeTrue();
    $test->call('__warpContextMenu', [], 'bulk')->assertReturned(fn ($items) => $items[0]['name'] === 'onlyBulk');
});

it('mirrors only bulk actions from a toolbar that also contains ordinary actions', function () {
    MenuTable::$configure = fn ($table) => $table->toolbarActions([
        Action::make('notBulk'),
        ActionGroup::make([BulkAction::make('bulkInGroup')])->label('Bulk'),
    ])->contextMenuBulkActions();
    livewire(MenuTable::class)->call('__warpContextMenu', [], 'bulk')->assertReturned(fn ($items) => count($items) === 1 && $items[0]['items'][0]['name'] === 'bulkInGroup');
});
