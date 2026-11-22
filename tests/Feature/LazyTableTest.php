<?php

use Livewire\Features\SupportTesting\Testable;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Customer;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\LazyTable;

use function Pest\Livewire\livewire;

beforeEach(function () {
    usePanel('admin');
    $this->actingAs(manager());
    Customer::create(['name' => 'Lazy customer row']);
});

function resumeLazyContextMenuTable(Testable $component): Testable
{
    $component->assertSuccessful()->assertDontSee('Lazy customer row');
    expect($component->snapshot['memo']['lazyLoaded'])->toBeFalse();

    // Use the mount-parameter snapshot from the real placeholder, as the browser does.
    $placeholder = html_entity_decode($component->html(), ENT_QUOTES | ENT_HTML5);
    expect($placeholder)->toContain('x-intersect=');
    expect(preg_match("/__lazyLoad\('([^']+)'\)/", $placeholder, $matches))->toBe(1);

    $component->call('__lazyLoad', $matches[1])
        ->assertSuccessful()->assertSee('Lazy customer row');
    expect($component->snapshot['memo']['lazyLoaded'])->toBeTrue();

    return $component;
}

it('loads a lazy table without context menus through the placeholder request', function () {
    $component = resumeLazyContextMenuTable(livewire(LazyTable::class));

    $component->assertDontSee('data-warp-context-menu-config', escape: false);
});

it('loads a lazy table with context menus through the placeholder request and refreshes', function () {
    $component = resumeLazyContextMenuTable(livewire(LazyTable::class, ['contextMenuEnabled' => true]));

    $component->assertSee('data-warp-context-menu-kind="record"', escape: false)
        ->assertSee('data-warp-context-menu-config=', escape: false)
        ->call('$refresh')->assertSuccessful()->assertSee('Lazy customer row')
        ->assertSee('data-warp-context-menu-kind="record"', escape: false)
        ->assertSee('data-warp-context-menu-config=', escape: false);
});

it('fetches and executes a context menu action on subsequent requests after lazy loading', function () {
    $record = Customer::query()->sole();
    $component = resumeLazyContextMenuTable(livewire(LazyTable::class, ['contextMenuEnabled' => true]));
    $payload = null;

    $component->call('__warpContextMenu', [$record->getKey()])->assertSuccessful()
        ->assertReturned(function ($data) use ($record, &$payload) {
            expect(array_column($data[$record->getKey()]['items'], 'name'))->toBe(['inspect']);
            $payload = $data[$record->getKey()]['items'][0];
            expect($payload)->toMatchArray([
                'name' => 'inspect',
                'label' => 'Inspect customer',
                'arguments' => [],
                'context' => ['table' => true, 'recordKey' => (string) $record->getKey()],
            ]);

            return true;
        });

    $component->call('mountAction', $payload['name'], $payload['arguments'], $payload['context'])
        ->assertSuccessful()->assertHasNoErrors()
        ->assertSet('mountedActions.0.name', 'inspect');
    expect($record->fresh()->name)->toBe('Lazy customer row');

    // Confirmation runs in a fresh request, exercising hydration of the mounted menu action.
    $component->call('callMountedAction')->assertSuccessful()->assertHasNoErrors()
        ->assertSet('mountedActions', []);
    expect($record->fresh()->name)->toBe('Inspected lazy customer');
});
