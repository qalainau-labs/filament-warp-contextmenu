<?php

use Illuminate\Support\Arr;
use Illuminate\Support\ServiceProvider;
use Qalainau\FilamentWarpContextMenu\Support\Menus;
use Qalainau\FilamentWarpContextMenu\WarpContextMenuServiceProvider;

// 10 言語（en・ja と de・fr・es・it・pt_BR・ko・zh_CN・zh_TW）。いまは en と ja だけなので、8 言語が足されるまで最初のテストは落ちる
it('has all ten languages', function (): void {
    $languages = array_map('basename', glob(__DIR__.'/../../resources/lang/*', GLOB_ONLYDIR));

    expect($languages)->toEqualCanonicalizing(['de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt_BR', 'zh_CN', 'zh_TW']);
});

it('does not use the words 版 or 札 in Japanese', function (): void {
    $found = collect(Arr::dot(require __DIR__.'/../../resources/lang/ja/contextmenu.php'))
        ->filter(fn (mixed $line): bool => is_string($line) && preg_match('/版|札/u', $line) === 1)
        ->keys()
        ->all();

    expect($found)->toBe([]);
});

/**
 * 翻訳は resources/lang/<locale>/contextmenu.php。英語のファイルを正として、10 言語にそろっているかを見る。
 *
 * @return list<array{0: string, 1: string}>
 */
function warpContextMenuTranslationFiles(): array
{
    $files = [];

    foreach (glob(__DIR__.'/../../resources/lang/en/*.php') as $english) {
        foreach (glob(__DIR__.'/../../resources/lang/*', GLOB_ONLYDIR) as $folder) {
            if (! str_ends_with($folder, '/en')) {
                $files[basename($folder).'/'.basename($english)] = [$english, $folder.'/'.basename($english)];
            }
        }
    }

    return $files;
}

it('has every file in every language', function (string $english, string $file): void {
    expect(is_file($file))->toBeTrue("{$file} is missing");
})->with(warpContextMenuTranslationFiles());

it('has the same translation keys in every language', function (string $english, string $file): void {
    $keys = fn (string $path): array => array_keys(Arr::dot(require $path));

    expect($keys($file))->toEqualCanonicalizing($keys($english));
})->with(warpContextMenuTranslationFiles());

it('uses only translation keys that exist', function (): void {
    $english = [];

    foreach (glob(__DIR__.'/../../resources/lang/en/*.php') as $file) {
        foreach (Arr::dot(require $file) as $key => $line) {
            $english[basename($file, '.php').'.'.$key] = $line;
        }
    }

    $sources = collect([
        ...glob(__DIR__.'/../../resources/views/{,*/,*/*/}*.blade.php', GLOB_BRACE),
        ...glob(__DIR__.'/../../src/{,*/,*/*/}*.php', GLOB_BRACE),
    ])->map(fn (string $file): string => file_get_contents($file))->implode("\n");

    preg_match_all('/warp-contextmenu::([a-z0-9_]+\\.[a-z0-9_.]+)(?<!\\.)/', $sources, $matches);

    // ビュー（warp-contextmenu::components.link）は除く：翻訳のファイルの名前で始まるものだけ
    $files = array_map(fn (string $file): string => basename($file, '.php'), glob(__DIR__.'/../../resources/lang/en/*.php'));

    $missing = collect($matches[1])
        ->unique()
        ->filter(fn (string $key): bool => in_array(explode('.', $key)[0], $files, true))
        // 組み立てるキーは、前半だけを確かめる
        ->reject(fn (string $key): bool => array_key_exists($key, $english) || collect(array_keys($english))->contains(fn (string $known): bool => str_starts_with($known, $key.'.')))
        ->values()
        ->all();

    expect($missing)->toBe([]);
});

it('keeps the placeholders and the singular|plural pairs in every language', function (string $english, string $file): void {
    $source = Arr::dot(require $english);
    $translated = Arr::dot(require $file);
    $shape = function (string $line) use ($file): array {
        preg_match_all('/:[a-z_]+/', $line, $matches);
        $found = array_unique($matches[0]);
        sort($found);

        return [...$found, 'forms' => preg_match('#/(ja|ko|zh_CN|zh_TW)/#', $file) ? false : substr_count($line, '|') > 0];
    };

    foreach ($source as $key => $line) {
        expect($shape((string) ($translated[$key] ?? '')))->toBe($shape((string) $line), "{$key} in {$file}");
    }
})->with(warpContextMenuTranslationFiles());

it('speaks to Spanish users with tú, like the demo, not usted', function (): void {
    $usted = '/\b(usted|Haga|Elija|Pruebe|Pulse|Escriba|Añada|Pegue|Use|Seleccione|Introduzca)\b/u';
    $found = [];

    foreach (glob(__DIR__.'/../../resources/lang/es/*.php') as $file) {
        foreach (Arr::dot(require $file) as $key => $line) {
            if (is_string($line) && preg_match($usted, $line) === 1) {
                $found[] = basename($file).': '.$key;
            }
        }
    }

    expect($found)->toBe([]);
});

it('publishes the translations where Laravel reads the overrides of the warp-contextmenu namespace', function (): void {
    $paths = ServiceProvider::pathsToPublish(WarpContextMenuServiceProvider::class, 'filament-warp-contextmenu-translations');

    expect(array_values($paths))->toBe([app()->langPath('vendor/warp-contextmenu')]);
});

it('has every JavaScript message and all three dynamic menu labels in English', function () {
    $english = require __DIR__.'/../../resources/lang/en/contextmenu.php';
    $sources = collect(glob(__DIR__.'/../../resources/js/*.js'))->map(fn ($file) => file_get_contents($file))->implode("\n");
    preg_match_all('/messages\.([a-z_]+)/', $sources, $matches);
    preg_match_all('/messages\[[^\]\n]*[\'"]([a-z_]+)[\'"]\s*:\s*[\'"]([a-z_]+)[\'"]\]/', $sources, $dynamic);
    $keys = array_unique([...$matches[1], ...$dynamic[1], ...$dynamic[2], 'label_record', 'label_bulk', 'label_page']);
    foreach ($keys as $key) {
        expect($english)->toHaveKey($key);
        expect($english[$key])->toBeString()->not->toBe('');
    }
});

it('uses Filament selection messages and identifies manually added text in all ten locales', function () {
    foreach (['de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt_BR', 'zh_CN', 'zh_TW'] as $locale) {
        app()->setLocale($locale);
        $config = Menus::clientConfig('record');
        expect($config['selectedCount'])->toBe(__('filament-tables::table.selection_indicator.selected_count'));
        expect($config['messages'])->not->toHaveKey('selected');
        expect($config['messages']['clipboard_added_text'])->toBeString()->not->toBe('');
    }
});
