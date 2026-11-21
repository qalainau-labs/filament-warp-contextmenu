<?php

use Filament\Actions\Action;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Customer;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\MenuTable;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\RecordMenuPage;

use function Pest\Livewire\livewire;

beforeEach(function () {
    usePanel('admin');
    $this->actingAs(manager());
    $this->alice = Customer::create(['name' => 'Alice']);
    $this->bob = Customer::create(['name' => 'Bob']);
    MenuTable::$configure = fn ($table) => $table->contextMenu([
        Action::make('confirm')->requiresConfirmation()
            ->authorize(fn ($record) => $record?->name === 'Bob')
            ->action(fn ($record) => $record->update(['name' => 'Executed'])),
    ]);
});

afterEach(fn () => MenuTable::$configure = null);

it('does not change a mounted record when fetching a menu before execution in one request', function () {
    $test = livewire(MenuTable::class)->call('mountAction', 'confirm', [], ['table' => true, 'recordKey' => (string) $this->bob->id]);
    expect($test->instance()->getMountedAction()->getRecord()->getKey())->toBe($this->bob->id);
    $test->update([
        ['method' => '__warpContextMenu', 'params' => [[$this->alice->id], 'record']],
        ['method' => 'callMountedAction', 'params' => []],
    ]);
    expect($this->alice->fresh()->name)->toBe('Alice');
    expect($this->bob->fresh()->name)->toBe('Executed');
});

it('does not lend the prefetched record to mounting without a record key in one request', function () {
    livewire(MenuTable::class)->update([
        ['method' => '__warpContextMenu', 'params' => [[$this->bob->id], 'record']],
        ['method' => 'mountAction', 'params' => ['confirm', [], ['table' => true]]],
        ['method' => 'callMountedAction', 'params' => []],
    ])->assertSet('mountedActions', []);
    expect($this->bob->fresh()->name)->toBe('Bob');
});

it('preserves a page action record through menu evaluation and native mounting in one request', function () {
    view()->addNamespace('warp-contextmenu', __DIR__.'/../views');
    livewire(RecordMenuPage::class, ['recordId' => $this->bob->id])->update([
        ['method' => '__warpContextMenu', 'params' => [[], 'page']],
        ['method' => 'mountAction', 'params' => ['confirm']],
        ['method' => 'callMountedAction', 'params' => []],
    ]);
    expect($this->alice->fresh()->name)->toBe('Alice');
    expect($this->bob->fresh()->name)->toBe('Executed');
});

it('evaluates only the first of three menu calls in one request and resets on the next request', function () {
    $evaluations = 0;
    MenuTable::$configure = function ($table) use (&$evaluations) {
        return $table->contextMenu([
            Action::make('confirm')->label(function () use (&$evaluations) {
                $evaluations++;

                return 'Confirm';
            }),
        ]);
    };
    $test = livewire(MenuTable::class)->update([
        ['method' => '__warpContextMenu', 'params' => [[$this->bob->id], 'record']],
        ['method' => '__warpContextMenu', 'params' => [[$this->alice->id], 'record']],
        ['method' => '__warpContextMenu', 'params' => [[$this->bob->id], 'record']],
    ]);
    $returns = $test->effects['returns'];
    expect($returns[0][$this->bob->id]['items'][0]['name'])->toBe('confirm');
    expect(array_slice($returns, 1))->toBe([[], []]);
    expect($evaluations)->toBe(1);
    $test->call('__warpContextMenu', [$this->bob->id])->assertReturned(fn ($data) => $data[$this->bob->id]['items'][0]['name'] === 'confirm');
    expect($evaluations)->toBe(2);
});
