<?php

use Filament\Actions\Action;
use Filament\Actions\ActionGroup;
use Filament\Actions\BulkAction;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\View\ViewException;
use Livewire\Features\SupportTesting\Testable;
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

function assertMenuOnlyActionStaysOutOfRows(Testable $test, string $label): void
{
    expect($test->instance()->getTable()->getRecordActions())->toBe([]);
    $document = new DOMDocument;
    $document->loadHTML($test->html(), LIBXML_NOERROR | LIBXML_NOWARNING);
    $xpath = new DOMXPath($document);
    $rows = $xpath->query('//table[contains(concat(" ", normalize-space(@class), " "), " fi-ta-table ")]/tbody');
    expect($rows->length)->toBe(1);
    expect($xpath->query('.//*[contains(concat(" ", normalize-space(@class), " "), " fi-ta-actions ")]', $rows->item(0))->length)->toBe(0);
    expect($rows->item(0)->textContent)->not->toContain($label);
}

it('keeps menu-only record actions out of rows after mounting and confirming', function () {
    MenuTable::$configure = fn ($table) => $table->contextMenu([
        Action::make('menuConfirm')->label('Menu-only confirmation')->requiresConfirmation()
            ->action(fn ($record) => $record->update(['name' => 'Menu confirmed'])),
    ]);
    $test = livewire(MenuTable::class)->call('mountAction', 'menuConfirm', [], ['table' => true, 'recordKey' => (string) $this->record->id])
        ->assertSet('mountedActions.0.name', 'menuConfirm')
        ->assertDispatched('sync-action-modals', fn ($event, $params) => $params['newActionNestingIndex'] === 0);
    expect($this->record->fresh()->name)->toBe('Alice');
    assertMenuOnlyActionStaysOutOfRows($test, 'Menu-only confirmation');

    $test->call('callMountedAction')->assertSet('mountedActions', []);
    expect($this->record->fresh()->name)->toBe('Menu confirmed');
    assertMenuOnlyActionStaysOutOfRows($test, 'Menu-only confirmation');
});

it('keeps cell-only actions out of rows after mounting and confirming', function () {
    MenuTable::$configure = fn ($table) => Table::make($table->getLivewire())->query(Customer::query())->columns([
        TextColumn::make('name')->contextMenu([
            Action::make('cellConfirm')->label('Cell-only confirmation')->requiresConfirmation()
                ->action(fn ($record) => $record->update(['name' => 'Cell confirmed'])),
        ]),
    ]);
    $test = livewire(MenuTable::class)->call('mountAction', 'cellConfirm', [], ['table' => true, 'recordKey' => (string) $this->record->id])
        ->assertSet('mountedActions.0.name', 'cellConfirm')
        ->assertDispatched('sync-action-modals', fn ($event, $params) => $params['newActionNestingIndex'] === 0);
    expect($this->record->fresh()->name)->toBe('Alice');
    assertMenuOnlyActionStaysOutOfRows($test, 'Cell-only confirmation');

    $test->call('callMountedAction')->assertSet('mountedActions', []);
    expect($this->record->fresh()->name)->toBe('Cell confirmed');
    assertMenuOnlyActionStaysOutOfRows($test, 'Cell-only confirmation');
});

it('does not duplicate native record actions while resolving a mirrored menu', function () {
    $counts = [];
    $observe = function ($livewire) use (&$counts): void {
        $table = $livewire->getTable();
        $counts[] = [count($table->getFlatRecordActions()), count($table->getRecordActions())];
    };
    MenuTable::$configure = fn ($table) => $table->recordActions([
        Action::make('nativeConfirm')->label('Native confirmation')->requiresConfirmation()->mountUsing($observe)
            ->action(function ($record, $livewire) use ($observe): void {
                $observe($livewire);
                $record->update(['name' => 'Native confirmed']);
            }),
    ])->contextMenu();
    $test = livewire(MenuTable::class);
    expect($test->instance()->getTable()->getFlatRecordActions())->toHaveCount(1);
    $test->call('mountAction', 'nativeConfirm', [], ['table' => true, 'recordKey' => (string) $this->record->id])
        ->assertSet('mountedActions.0.name', 'nativeConfirm')->assertSee('Native confirmation');
    expect($this->record->fresh()->name)->toBe('Alice');
    expect($test->instance()->getTable()->getFlatRecordActions())->toHaveCount(1);
    expect($test->instance()->getTable()->getRecordActions())->toHaveCount(1);

    $test->call('callMountedAction')->assertSet('mountedActions', []);
    expect($this->record->fresh()->name)->toBe('Native confirmed');
    expect($test->instance()->getTable()->getFlatRecordActions())->toHaveCount(1);
    expect($test->instance()->getTable()->getRecordActions())->toHaveCount(1);
    expect($counts)->toBe([[1, 1], [1, 1]]);
});

it('rejects a header action with a record key when it is absent from the menu', function () {
    MenuTable::$configure = fn ($table) => $table->headerActions([
        Action::make('headerOnly')->action(fn () => Customer::query()->whereKey($this->record->id)->update(['name' => 'Header executed'])),
    ]);
    $test = livewire(MenuTable::class)->call('__warpContextMenu', [$this->record->id])
        ->assertReturned(fn ($data) => array_column($data[$this->record->id]['items'], 'name') === ['rename']);
    expect($test->instance()->getTable()->getAction('headerOnly')->getName())->toBe('headerOnly');
    $test->call('mountAction', 'headerOnly', [], ['table' => true, 'recordKey' => (string) $this->record->id])
        ->assertSet('mountedActions', []);
    expect($this->record->fresh()->name)->toBe('Alice');
    $test->call('callMountedAction')->assertSet('mountedActions', []);
    expect($this->record->fresh()->name)->toBe('Alice');

    $test->call('mountAction', 'headerOnly', [], ['table' => true]);
    expect($this->record->fresh()->name)->toBe('Header executed');
});

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
        expect($data[$this->record->id]['items'][0])->toMatchArray(['label' => 'Alice', 'disabled' => false, 'checked' => true, 'checkable' => true, 'color' => 'success', 'badge' => '2', 'newTab' => true, 'shortcut' => ['mod+e']]);
        expect($data[$other->id]['items'][0])->toMatchArray(['label' => 'Bob', 'disabled' => true, 'tooltip' => 'Already paid', 'checked' => false, 'checkable' => true]);
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
    livewire(MenuTable::class)->call('__warpContextMenu', [$this->record->id])->assertReturned([$this->record->id => ['items' => [], 'cells' => [], 'title' => null]])
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

it('passes configured arguments and context from payload to native mounting', function () {
    MenuTable::$configure = fn ($table) => $table->contextMenu([
        Action::make('withArguments')->arguments(['name' => 'Argument delivered'])
            ->action(fn ($record, array $arguments) => $record->update(['name' => $arguments['name']])),
    ]);
    $payload = null;
    $test = livewire(MenuTable::class)->call('__warpContextMenu', [$this->record->id])->assertReturned(function ($data) use (&$payload) {
        $payload = $data[$this->record->id]['items'][0];
        expect($payload)->toMatchArray([
            'arguments' => ['name' => 'Argument delivered'],
            'context' => ['table' => true, 'recordKey' => (string) $this->record->id], 'checkable' => false,
        ]);

        return true;
    });
    $test->call('mountAction', $payload['name'], $payload['arguments'], $payload['context']);
    expect($this->record->fresh()->name)->toBe('Argument delivered');
});

it('mounts grouped and following actions across separators and blocks the grouped child', function () {
    MenuTable::$configure = fn ($table) => $table->contextMenu([
        ContextMenu::separator(),
        ActionGroup::make([Action::make('a')->authorize(fn () => auth()->user()?->email !== 'blocked@example.com')
            ->action(fn ($record) => $record->update(['name' => 'Grouped']))])->label('Group'),
        ContextMenu::separator(),
        Action::make('b')->action(fn ($record) => $record->update(['name' => 'Following'])),
    ]);
    $context = ['table' => true, 'recordKey' => (string) $this->record->id];
    livewire(MenuTable::class)->call('mountAction', 'a', [], $context);
    expect($this->record->fresh()->name)->toBe('Grouped');
    livewire(MenuTable::class)->call('mountAction', 'b', [], $context);
    expect($this->record->fresh()->name)->toBe('Following');
    $this->actingAs(User::create(['name' => 'Blocked', 'email' => 'blocked@example.com']));
    livewire(MenuTable::class)->call('mountAction', 'a', [], $context)->assertSet('mountedActions', []);
    expect($this->record->fresh()->name)->toBe('Following');
});

it('rejects non actions in record menus', function () {
    MenuTable::$configure = fn ($table) => $table->contextMenu(['invalid']);
    livewire(MenuTable::class);
})->throws(ViewException::class, 'expected a Filament Action, ActionGroup or ContextMenu::separator().');

it('rejects ordinary actions in bulk menus', function () {
    MenuTable::$configure = fn ($table) => $table->contextMenuBulkActions([Action::make('ordinary')]);
    livewire(MenuTable::class);
})->throws(ViewException::class, 'expected a Filament action (BulkAction for selected records).');

it('rejects names conflicting with registered table actions', function () {
    MenuTable::$configure = fn ($table) => $table->recordActions([Action::make('rename')]);
    livewire(MenuTable::class);
})->throws(ViewException::class, 'action name [rename] conflicts with a registered table action.');

it('omits hidden and toggled cell menus while preserving the following column', function () {
    MenuTable::$configure = fn ($table) => $table->columns([
        TextColumn::make('hidden')->hidden()->contextMenu([Action::make('hiddenCell')]),
        TextColumn::make('toggled')->toggleable()->contextMenu([Action::make('toggledCell')]),
        TextColumn::make('name')->contextMenu([Action::make('visibleCell')]),
    ]);
    $test = livewire(MenuTable::class);
    $columns = $test->instance()->tableColumns;
    foreach ($columns as &$column) {
        if ($column['name'] === 'toggled') {
            $column['isToggled'] = false;
        }
    }
    unset($column);
    $test->call('applyTableColumnManager', $columns)->call('__warpContextMenu', [$this->record->id])->assertReturned(function ($data) {
        expect(array_keys($data[$this->record->id]['cells']))->toBe(['name']);
        expect($data[$this->record->id]['cells']['name'][0])->toMatchArray(['name' => 'visibleCell', 'checkable' => false]);

        return true;
    });
});

it('only renders explicitly configured group icons', function () {
    MenuTable::$configure = fn ($table) => $table->contextMenu([
        ActionGroup::make([Action::make('plain')])->label('Plain'),
        ActionGroup::make([Action::make('decorated')])->label('Decorated')->icon(fn () => 'heroicon-o-flag'),
    ]);
    livewire(MenuTable::class)->call('__warpContextMenu', [$this->record->id])->assertReturned(function ($data) {
        expect($data[$this->record->id]['items'][0]['icon'])->toBeNull();
        expect($data[$this->record->id]['items'][1]['icon'])->toContain('<svg');

        return true;
    });
});

it('controls table clipboard menus independently of page menus', function () {
    $table = livewire(MenuTable::class)->instance()->getTable();
    expect(Menus::clientConfig('record', $table)['clipboardMenu'])->toBeTrue();
    expect($table->contextMenuClipboard(false))->toBe($table);
    expect(Menus::clientConfig('record', $table)['clipboardMenu'])->toBeFalse();
    expect(Menus::clientConfig('page')['clipboardMenu'])->toBeTrue();
    expect(Menus::clientConfig('record', $table))->not->toHaveKeys(['clipboard', 'clipboardButtons']);
    $table->contextMenuClipboard();
    expect(Menus::clientConfig('record', $table)['clipboardMenu'])->toBeTrue();
});

it('includes the configured record title and no title without one', function () {
    foreach (['attribute', 'custom', 'empty', 'key'] as $mode) {
        MenuTable::$configure = fn (Table $table) => match ($mode) {
            'attribute' => $table->recordTitleAttribute('name'),
            'custom' => $table->recordTitle(fn ($record) => 'Customer '.$record->name),
            'empty' => $table->recordTitle(fn () => ''),
            default => $table,
        };
        livewire(MenuTable::class)->call('__warpContextMenu', [$this->record->id])->assertReturned(function ($data) use ($mode) {
            expect($data[$this->record->id]['title'])->toBe(match ($mode) {
                'attribute' => 'Alice',
                'custom' => 'Customer Alice',
                default => null,
            });

            return true;
        });
    }
});
