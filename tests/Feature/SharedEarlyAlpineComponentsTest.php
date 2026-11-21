<?php

// 自動生成: Warp monorepo の shared/tests/EarlyAlpineComponentsTest.php から bin/sync-shared でコピーしたもの。直すときは shared/ のほうを直す。

use Qalainau\FilamentWarpContextMenu\Support\EarlyAlpineComponents;

/*
 * x-load であとから読む部品の名前が、全部 EarlyAlpineComponents::register() に渡されているか。
 * 名前は JS の元のファイル（resources/js/**）の `export default function warpXxx(` から集める（ビルド後の dist は名前が潰れる）。
 * x-data が `{{ $xData }}` のようにあとで決まるプラグインでも、JS 側は必ず関数の名前を持つので取りこぼさない。
 * 逆に、渡した名前が JS にも x-data にも無ければ（余り・綴りの誤り）落ちる。
 * 部品を足して register に書き忘れる／ふつうの JS を渡してしまうと、ここで落ちる。
 */

/**
 * @return list<string>
 */
function warpEarlyComponentSourceNames(string $root): array
{
    $names = [];

    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root.'/resources/js', FilesystemIterator::SKIP_DOTS)) as $file) {
        if ($file->getExtension() !== 'js') {
            continue;
        }

        // warp で始まる名前だけ（core/ の中のふつうの関数の default export は x-load の部品ではない）
        if (preg_match_all('/^export default function (warp[A-Z]\w*)\s*\(/m', (string) file_get_contents($file->getPathname()), $matches)) {
            array_push($names, ...$matches[1]);
        }
    }

    sort($names);

    return array_values(array_unique($names));
}

/**
 * x-load の要素と PHP から渡す xData の中で、`name(` として呼んでいる名前を集める。
 */
function warpEarlyComponentTemplateText(string $root): string
{
    $text = '';

    foreach (['src', 'resources/views'] as $dir) {
        if (! is_dir("{$root}/{$dir}")) {
            continue;
        }

        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator("{$root}/{$dir}", FilesystemIterator::SKIP_DOTS)) as $file) {
            if ($file->getExtension() === 'php') {
                $text .= file_get_contents($file->getPathname())."\n";
            }
        }
    }

    return $text;
}

it('passes every x-load component name to EarlyAlpineComponents::register()', function () {
    $root = dirname(__DIR__, 2);
    $expected = warpEarlyComponentSourceNames($root);

    expect($expected)->not->toBeEmpty('JS の元のファイルに x-load の部品（export default function warpXxx）が見つからない');

    $registered = EarlyAlpineComponents::names();
    sort($registered);

    expect($registered)->toBe($expected);
});

it('only registers names that the views or PHP call from x-data', function () {
    $text = warpEarlyComponentTemplateText(dirname(__DIR__, 2));

    preg_match_all('/[\'"](warp[A-Za-z]*)[\'"]/', $text, $quoted);

    foreach (EarlyAlpineComponents::names() as $name) {
        // x-data="warpX(…)"・'xData' => 'warpX(…' と書いてあるか、'warpTree'.Str::studly($component) のように名前を組み立てる書き方（接頭辞が文字で書いてある）
        $called = str_contains($text, $name.'(') || collect($quoted[1])->contains(fn (string $prefix): bool => str_starts_with($name, $prefix));

        expect($called)->toBeTrue("{$name} を x-data から呼ぶ所が src/・resources/views/ に無い（綴りの誤りか、もう使わない部品）");
    }
});

it('renders one script that registers each name as an empty component on alpine:init', function () {
    $script = EarlyAlpineComponents::script(['warpA', 'warpB']);

    expect($script)->toBe('<script>document.addEventListener(\'alpine:init\',function(){window.Alpine.data(\'warpA\',function(){return{}});window.Alpine.data(\'warpB\',function(){return{}});})</script>');
});

it('rejects names that are not plain identifiers', function () {
    EarlyAlpineComponents::register(['warp-x"]);alert(1);//']);
})->throws(InvalidArgumentException::class);
