<?php

use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Customer;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Resources\Pages\ListCustomers;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Resources\Pages\ListUuidCustomers;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Team;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\UuidCustomer;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\UuidTeam;

use function Pest\Livewire\livewire;

it('rejects foreign record keys from the access matrix on fetch and direct mount', function (array $case) {
    usePanel('admin');
    $user = manager();
    $this->actingAs($user);
    $uuid = $case['scope'] === 'uuid';
    $teamClass = $uuid ? UuidTeam::class : Team::class;
    $recordClass = $uuid ? UuidCustomer::class : Customer::class;
    $mine = $teamClass::create(['name' => 'Mine']);
    $theirs = $teamClass::create(['name' => 'Theirs']);
    $record = $recordClass::create(['name' => 'Foreign', $uuid ? 'uuid_team_id' : 'team_id' => $theirs->getKey()]);
    ($uuid ? $user->uuidTeams() : $user->teams())->attach($mine);
    usePanel($case['scope'], $mine);
    livewire($uuid ? ListUuidCustomers::class : ListCustomers::class)->call('__warpContextMenu', [$record->getKey()])
        ->assertReturned([$record->getKey() => ['items' => [], 'cells' => []]])
        ->call('mountAction', $case['action'], [], ['table' => true, 'recordKey' => (string) $record->getKey()])->assertSet('mountedActions', []);
    usePanel('admin');
    expect($record->fresh()->name)->toBe('Foreign');
})->with(array_map(fn ($case) => [$case], array_filter(json_decode(file_get_contents(__DIR__.'/../Fixtures/access-cases.json'), true), fn ($case) => isset($case['scope']))));
