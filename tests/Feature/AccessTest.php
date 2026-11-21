<?php

use Filament\Actions\Action;
use Filament\Actions\BulkAction;
use Filament\Actions\DeleteAction;
use Filament\Actions\EditAction;
use Filament\Facades\Filament;
use Illuminate\Support\Facades\Gate;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Customer;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\MenuPage;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\MenuTable;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Resources\Pages\ListCustomers;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Team;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\User;

use function Pest\Livewire\livewire;

beforeEach(function () {
    usePanel('admin');
    $this->actingAs(manager());
    $this->record = Customer::create(['name' => 'Alice']);
    MenuTable::$configure = null;
});
afterEach(fn () => MenuTable::$configure = null);

it('guards payloads and direct native mounting', function (array $case) {
    if ($case['recordSecret'] ?? false) {
        $this->record->update(['secret' => true]);
    }
    $this->actingAs(User::firstOrCreate(['email' => $case['who']], ['name' => 'Actor']));
    MenuTable::$configure = function ($table) use ($case) {
        $run = fn ($record) => $record->update(['name' => 'Executed']);
        $action = match ($case['guard']) {
            'policy' => DeleteAction::make('delete')->authorize(fn ($record) => auth()->user()->can('delete', $record)),
            'visible' => Action::make($case['action'])->visible(fn ($record) => $record->name !== 'Alice')->action($run),
            'disabled' => Action::make($case['action'])->disabled(fn ($record) => $record->name === 'Alice')->action($run),
            'bulk' => BulkAction::make($case['action'])->authorize(false)->action(fn ($records) => $records->each->update(['name' => 'Executed'])),
            'copyPolicy' => Action::make($case['action'])->contextMenuCopy(fn ($record) => 'private-'.$record->name),
            'copyHidden' => Action::make($case['action'])->hidden()->contextMenuCopy(fn ($record) => 'private-'.$record->name),
        };
        $action->label($case['label']);

        return $case['guard'] === 'bulk' ? $table->contextMenuBulkActions([$action]) : $table->contextMenu([$action]);
    };
    $bulk = $case['guard'] === 'bulk';
    $test = livewire(MenuTable::class)->call('__warpContextMenu', [$this->record->id], $bulk ? 'bulk' : 'record')
        ->assertReturned(function ($data) use ($case, $bulk) {
            $items = $bulk ? $data : $data[$this->record->id]['items'];
            expect(in_array($case['action'], array_column($items, 'name')))->toBe($case['payload']);
            if (! $case['payload']) {
                expect(json_encode($items))->not->toContain($case['action'], $case['label'], 'private-Alice');
            }

            return true;
        });
    if (! str_starts_with($case['guard'], 'copy')) {
        $context = ['table' => true, ...($bulk ? ['bulk' => true] : ['recordKey' => (string) $this->record->id])];
        $test->set('selectedTableRecords', [(string) $this->record->id])->call('mountAction', $case['action'], [], $context)->assertSet('mountedActions', []);
        expect($this->record->fresh()->name)->toBe('Alice');
    }
})->with(array_map(fn ($case) => [$case], array_filter(json_decode(file_get_contents(__DIR__.'/../Fixtures/access-cases.json'), true), fn ($case) => isset($case['guard']))));

it('caps the payload at one hundred records', function () {
    livewire(MenuTable::class)->call('__warpContextMenu', range(1000, 1100))->assertReturned(fn ($data) => count($data) === 100);
});

it('rejects malformed menu requests', function (array $case) {
    $keys = $case['keys'] === 'record' ? [$this->record->id] : $case['keys'];
    if (is_array($keys)) {
        $keys = array_map(fn ($key) => $key === 'record' ? (string) $this->record->id : $key, $keys);
    }
    livewire(MenuTable::class)->call('__warpContextMenu', $keys, $case['kind'])->assertReturned(function ($data) use ($case) {
        if ($case['returnsRecord'] ?? false) {
            expect(array_keys($data))->toBe([$this->record->id]);
            expect($data[$this->record->id]['items'][0])->toMatchArray(['name' => 'rename']);
        } else {
            expect($data)->toBe([]);
        }

        return true;
    });
})->with(array_map(fn ($case) => [$case], json_decode(file_get_contents(__DIR__.'/../Fixtures/request-cases.json'), true)));

it('requires page opt in and omits hidden header actions', function () {
    view()->addNamespace('warp-contextmenu', __DIR__.'/../views');
    livewire(MenuPage::class)->call('__warpContextMenu', [], 'page')->assertReturned(fn ($items) => array_column($items, 'name') === ['pageAction']);
    Filament::getCurrentPanel()->getPlugin('warp-contextmenu')->pages(false);
    livewire(MenuPage::class)->call('__warpContextMenu', [], 'page')->assertReturned([]);
});

it('serializes malicious text literally and uses grouped icons', function () {
    $text = '<img src=x onerror=alert(1)>';
    MenuTable::$configure = fn ($table) => $table->contextMenu([
        Action::make('unsafe')->label($text)->tooltip($text)->badge($text)->url('javascript:alert(1)'),
        EditAction::make(), DeleteAction::make()->authorize(true),
    ]);
    livewire(MenuTable::class)->call('__warpContextMenu', [$this->record->id])->assertReturned(function ($data) use ($text) {
        $items = $data[$this->record->id]['items'];
        expect($items[0])->toMatchArray(['label' => $text, 'tooltip' => $text, 'badge' => $text]);
        expect($items[1]['icon'])->toContain('<svg');
        expect($items[2]['icon'])->toContain('<svg');

        return true;
    });
});

it('evaluates copy values per visible record and keywords on the server', function () {
    $other = Customer::create(['name' => 'Bob']);
    MenuTable::$configure = fn ($table) => $table->contextMenu([
        Action::make('copy')->contextMenuCopy(fn ($record) => $record->name)->contextMenuKeywords(fn ($record) => [$record->name, '番号']),
    ]);
    livewire(MenuTable::class)->call('__warpContextMenu', [$this->record->id, $other->id])->assertReturned(function ($data) use ($other) {
        expect($data[$this->record->id]['items'][0])->toMatchArray(['copyValue' => 'Alice', 'keywords' => ['Alice', '番号']]);
        expect($data[$other->id]['items'][0]['copyValue'])->toBe('Bob');

        return true;
    });
});

it('filters native page header actions using the access matrix', function (array $case) {
    Filament::getCurrentPanel()->getPlugin('warp-contextmenu')->pages($case['pagesEnabled']);
    livewire(ListCustomers::class)
        ->call('__warpContextMenu', [], 'page')->assertReturned(fn ($items) => array_column($items, 'name') === $case['expected']);
})->with(array_map(fn ($case) => [$case], array_filter(json_decode(file_get_contents(__DIR__.'/../Fixtures/access-cases.json'), true), fn ($case) => isset($case['pagesEnabled']))));

it('allows copy for a model without a policy and ordinary payloads for blocked viewers', function () {
    $record = Team::create(['name' => 'No policy']);
    expect(Gate::getPolicyFor($record))->toBeNull();
    MenuTable::$configure = fn ($table) => $table->query(Team::query())->contextMenu([
        Action::make('copy')->contextMenuCopy(fn ($record) => $record->name),
    ]);
    livewire(MenuTable::class)->call('__warpContextMenu', [$record->id])->assertReturned(function ($data) use ($record) {
        expect($data[$record->id]['items'][0])->toMatchArray(['name' => 'copy', 'copyValue' => 'No policy']);

        return true;
    });
    $this->actingAs(User::create(['name' => 'Blocked', 'email' => 'blocked@example.com']));
    MenuTable::$configure = fn ($table) => $table->contextMenu([Action::make('ordinary')]);
    livewire(MenuTable::class)->call('__warpContextMenu', [$this->record->id])->assertReturned(function ($data) {
        expect($data[$this->record->id]['items'][0])->toMatchArray(['name' => 'ordinary', 'copyValue' => null]);

        return true;
    });
});
