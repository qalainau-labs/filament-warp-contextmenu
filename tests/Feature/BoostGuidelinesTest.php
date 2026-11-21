<?php

use Filament\Actions\Action;
use Filament\Forms\Components\Select;
use Filament\Infolists\Components\Entry;
use Filament\Tables\Columns\Column;
use Filament\Tables\Table;
use Qalainau\FilamentWarpContextMenu\ContextMenu;
use Qalainau\FilamentWarpContextMenu\WarpContextMenuPlugin;

/**
 * Laravel Boost が AI に渡すガイドラインとスキル（resources/boost）。API の名前を変えたときに、AI が古い名前を
 * 書かないよう、書いてあるメソッド・クラスが実在するか、案内している README の見出しがあるかを確かめる。
 * 部品を足したら、文の中で名前だけ出るクラスを $classes に足す。
 */
function warpContextMenuBoostFiles(): array
{
    $root = dirname(__DIR__, 2).'/resources/boost';

    return [
        'guideline' => file_get_contents("{$root}/guidelines/core.md"),
        'skill' => file_get_contents("{$root}/skills/warp-contextmenu-development/SKILL.md"),
    ];
}

/**
 * @return list<class-string>
 */
function warpContextMenuBoostClasses(): array
{
    // 文の中で名前だけ出るクラス
    $classes = [WarpContextMenuPlugin::class, ContextMenu::class];

    // ガイドラインとスキルに出てくる Warp Context Menu のクラスは、どれもメソッドを持ちうる
    preg_match_all('/^use (Qalainau\\\\FilamentWarpContextMenu\\\\[\w\\\\]+);/m', implode("\n", warpContextMenuBoostFiles()), $imports);

    return array_values(array_unique([...$classes, ...array_filter($imports[1], fn (string $class): bool => class_exists($class) || trait_exists($class))]));
}

it('names the skill like its folder', function (): void {
    expect(warpContextMenuBoostFiles()['skill'])->toStartWith("---\nname: warp-contextmenu-development\n")
        ->and(warpContextMenuBoostFiles()['guideline'])->toContain('`warp-contextmenu-development`');
});

it('only uses methods that exist', function (): void {
    $text = implode("\n", warpContextMenuBoostFiles());

    preg_match_all('/->(\w+)\(/', $text, $chained);
    preg_match_all('/`(?:[\w:$>\-.]*?(?:->|::|\.))?(\w+)\(/', $text, $inline);

    // Pest・Livewire・Filament・Eloquent・Laravel と、例の中のアプリのメソッド
    $notOurs = ['and', 'make', 'columns', 'schema', 'url', 'pluck', 'query', 'where', 'auth', 'user', 'can', 'route', 'merge', 'orders', 'open',
        'getLabel', 'getColor', 'getPanel', 'setCurrentPanel', 'setTenant', 'actingAs', 'livewire', 'call', 'assertReturned', 'assertSet', 'recordActions',
        'plugin', 'toStartWith', 'toContain', 'toBe', 'toBeNull', 'forgetInstance', 'recordUrl',
        // Filament の欄・リソース・リレーション、文章の中の http(s)
        'relationship', 'options', 'canView', 'count', 'http'];

    $macros = [Column::class, Table::class, Action::class];

    $missing = collect([...$chained[1], ...$inline[1]])
        ->unique()
        ->reject(fn (string $method): bool => in_array($method, $notOurs, true)
            // Column・Entry・Select に足されるマクロ
            || collect($macros)->contains(fn (string $class): bool => $class::hasMacro($method))
            || collect(warpContextMenuBoostClasses())->contains(fn (string $class): bool => method_exists($class, $method)))
        ->values()
        ->all();

    expect($missing)->toBe([]);
});

it('only names classes that exist', function (): void {
    preg_match_all('/^use (Qalainau\\\\FilamentWarpContextMenu\\\\[\w\\\\]+);/m', implode("\n", warpContextMenuBoostFiles()), $imports);
    preg_match_all('/`(Qalainau\\\\FilamentWarpContextMenu\\\\[\w\\\\]+)`/', implode("\n", warpContextMenuBoostFiles()), $named);

    $classes = collect([...$imports[1], ...$named[1]])->unique();

    expect($classes)->not->toBeEmpty();

    foreach ($classes as $class) {
        expect(class_exists($class) || enum_exists($class) || trait_exists($class))->toBeTrue("{$class} does not exist");
    }
});

it('points to README sections that exist', function (): void {
    $readme = file_get_contents(dirname(__DIR__, 2).'/README.md');
    preg_match_all('/^#+ (.+)$/m', $readme, $headings);

    preg_match_all('/^\|.*\|(.*)\|$/m', warpContextMenuBoostFiles()['skill'], $cells);
    preg_match_all('/"([^"]+)"/', implode("\n", $cells[1]), $sections);
    preg_match_all('/See "([^"]+)"/', implode("\n", warpContextMenuBoostFiles()), $seeAlso);
    $sections = collect([...$sections[1], ...$seeAlso[1]])->unique()->reject(fn (string $cell): bool => $cell === 'README section');

    expect($sections)->not->toBeEmpty();

    foreach ($sections as $section) {
        expect($headings[1])->toContain($section);
    }
});
