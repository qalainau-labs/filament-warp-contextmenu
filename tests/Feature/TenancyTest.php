<?php

use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Customer;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Resources\Pages\ListCustomers;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Team;

use function Pest\Livewire\livewire;

beforeEach(function () {
    usePanel('admin');
    $this->mine = Team::create(['name' => 'Mine']);
    $this->theirs = Team::create(['name' => 'Theirs']);
    $this->ours = Customer::create(['name' => 'Ours', 'team_id' => $this->mine->id]);
    $this->foreign = Customer::create(['name' => 'Theirs', 'team_id' => $this->theirs->id]);
    $this->actingAs(manager());
    manager()->teams()->attach($this->mine);
    usePanel('team', $this->mine);
});

it('resolves every menu record using the tenant scoped table query', function () {
    livewire(ListCustomers::class)->call('__warpContextMenu', [$this->ours->id, $this->foreign->id])->assertReturned(function ($data) {
        expect($data[$this->ours->id]['items'][0]['label'])->toBe('Rename Ours');
        expect($data[$this->foreign->id])->toBe(['items' => [], 'cells' => []]);

        return true;
    });
});

it('cannot mount an action with a key from another tenant', function () {
    livewire(ListCustomers::class)->call('mountAction', 'rename', [], ['table' => true, 'recordKey' => (string) $this->foreign->id])->assertSet('mountedActions', []);
    usePanel('admin');
    expect($this->foreign->fresh()->name)->toBe('Theirs');
});

it('works in a panel without a tenant', function () {
    usePanel('admin');
    livewire(ListCustomers::class)->call('__warpContextMenu', [$this->foreign->id])->assertReturned(fn ($data) => $data[$this->foreign->id]['items'][0]['label'] === 'Rename Theirs');
});
