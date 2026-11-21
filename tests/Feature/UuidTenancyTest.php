<?php

use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Resources\Pages\ListUuidCustomers;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\UuidCustomer;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\UuidTeam;

use function Pest\Livewire\livewire;

it('keeps UUID records inside the UUID tenant query for both menus and mounting', function () {
    usePanel('admin');
    $mine = UuidTeam::create(['name' => 'Mine']);
    $theirs = UuidTeam::create(['name' => 'Theirs']);
    $ours = UuidCustomer::create(['name' => 'Our UUID', 'uuid_team_id' => $mine->id]);
    $foreign = UuidCustomer::create(['name' => 'Foreign UUID', 'uuid_team_id' => $theirs->id]);
    $this->actingAs(manager());
    manager()->uuidTeams()->attach($mine);
    usePanel('uuid', $mine);
    livewire(ListUuidCustomers::class)->call('__warpContextMenu', [$ours->id, $foreign->id])->assertReturned(function ($data) use ($ours, $foreign) {
        expect($data[$ours->id]['items'][0]['label'])->toBe('Rename Our UUID');
        expect($data[$foreign->id])->toBe(['items' => [], 'cells' => []]);

        return true;
    })->call('mountAction', 'rename', [], ['table' => true, 'recordKey' => $foreign->id])->assertSet('mountedActions', []);
});
