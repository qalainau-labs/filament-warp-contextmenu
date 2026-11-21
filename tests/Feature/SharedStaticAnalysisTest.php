<?php

// 自動生成: Warp monorepo の shared/tests/StaticAnalysisTest.php から bin/sync-shared でコピーしたもの。直すときは shared/ のほうを直す。

use Filament\Support\Components\Component;
use Symfony\Component\Process\Process;

/*
 * 買った人のアプリの静的解析（Larastan・PHPStan）に、このプラグインのせいで指摘が残らないか。
 *
 * プラグイン本体の Larastan は src だけを見るので、使う側で出る指摘は拾えない（2026-11-16、Warp Works の控えに
 * 「Call to an undefined method …::warp()」「Panel::plugin() expects Plugin, WarpInput given」が残っていた）。
 * そこで tests/PHPStan/Consumer.php に「買った人が書くコード」を置き、同梱の extension.neon を入れた Larastan で解析する。
 *
 * - src で Filament の部品に足したマクロは、全部 Consumer.php で呼ぶ（呼んでいないマクロは解析で見られない）
 * - @mixin で設定のクラスに渡すプラグインのクラスは、値を決めるメソッドを @method $this で宣言する
 * - Consumer.php を解析して、指摘が 0
 */

function warpSharedPackageRoot(): string
{
    return dirname(__DIR__, 2);
}

/**
 * src のクロージャで登録した Filament のマクロの名前。
 *
 * @return list<string>
 */
function warpSharedOwnFilamentMacros(): array
{
    $src = realpath(warpSharedPackageRoot().'/src');
    /** @var array<string, array<class-string, callable>> $macros */
    $macros = (new ReflectionProperty(Component::class, 'macros'))->getValue();
    $names = [];

    foreach ($macros as $name => $byClass) {
        foreach ($byClass as $macro) {
            if (! $macro instanceof Closure) {
                continue;
            }

            $file = (string) (new ReflectionFunction($macro))->getFileName();

            if (str_starts_with($file, $src.DIRECTORY_SEPARATOR)) {
                $names[] = $name;
            }
        }
    }

    return array_values(array_unique($names));
}

/**
 * src/*Plugin.php のうち、__call で設定のクラスに渡しているもの：[プラグインのクラス, 設定のクラス（@mixin。無ければ null）, docblock]。
 *
 * @return list<array{class-string, class-string|null, string}>
 */
function warpSharedMixinPlugins(): array
{
    $found = [];

    foreach (glob(warpSharedPackageRoot().'/src/*Plugin.php') ?: [] as $file) {
        $code = (string) file_get_contents($file);

        if (! preg_match('/^namespace\s+([^;]+);/m', $code, $namespace) || ! preg_match('/function\s+__call\s*\(/', $code)) {
            continue;
        }

        /** @var class-string $plugin */
        $plugin = $namespace[1].'\\'.basename($file, '.php');
        $settings = null;

        if (preg_match('/@mixin\s+\\\\?([\w\\\\]+)/', $code, $mixin)) {
            /** @var class-string $settings */
            $settings = str_contains($mixin[1], '\\') ? $mixin[1] : $namespace[1].'\\'.$mixin[1];
        }

        $found[] = [$plugin, $settings, (string) (new ReflectionClass($plugin))->getDocComment()];
    }

    return $found;
}

/**
 * @method の宣言と同じ書き方の引数（型は完全な名前、既定値つき）。宣言と比べるために使う。
 */
function warpSharedParameters(ReflectionMethod $method): string
{
    $builtin = ['null', 'bool', 'int', 'string', 'float', 'array', 'mixed', 'callable', 'iterable', 'object', 'false', 'true', 'static', 'self', 'void'];

    return implode(', ', array_map(function (ReflectionParameter $parameter) use ($builtin): string {
        $type = $parameter->hasType()
            ? preg_replace_callback('/[A-Za-z_\\\\]+/', fn (array $name): string => in_array(strtolower($name[0]), $builtin, true) ? $name[0] : '\\'.ltrim($name[0], '\\'), (string) $parameter->getType()).' '
            : '';
        $default = '';

        if ($parameter->isDefaultValueAvailable()) {
            $value = $parameter->getDefaultValue();
            $default = ' = '.($value === null ? 'null' : (is_array($value) ? '[]' : var_export($value, true)));
        }

        return $type.($parameter->isVariadic() ? '...' : '').'$'.$parameter->name.$default;
    }, $method->getParameters()));
}

/**
 * Consumer.php で ->名前( と呼んでいるメソッドの名前（コメント・文字列の中は数えない）。
 *
 * @return list<string>
 */
function warpSharedCalledMethods(string $code): array
{
    $tokens = array_values(array_filter(token_get_all($code), fn (mixed $token): bool => ! is_array($token) || ! in_array($token[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)));
    $called = [];

    foreach ($tokens as $index => $token) {
        if (is_array($token) && in_array($token[0], [T_OBJECT_OPERATOR, T_NULLSAFE_OBJECT_OPERATOR], true)
            && is_array($tokens[$index + 1] ?? null) && $tokens[$index + 1][0] === T_STRING && ($tokens[$index + 2] ?? null) === '(') {
            $called[] = $tokens[$index + 1][1];
        }
    }

    return array_values(array_unique($called));
}

it('calls every Filament macro this plugin registers in tests/PHPStan/Consumer.php', function (): void {
    $macros = warpSharedOwnFilamentMacros();
    $root = warpSharedPackageRoot();

    // src が Filament の部品に macro() を書いているのに 1 つも登録されていなければ、見張れていない（プロバイダーが登録されていない）
    $writesMacros = trim((string) shell_exec('grep -rhoE "\\b[A-Z][A-Za-z]*::macro\\(" '.escapeshellarg($root.'/src').' 2>/dev/null | grep -v "^Builder::"')) !== '';
    expect($macros === [] && $writesMacros)->toBeFalse('src registers Filament macros, but none were registered in the test app');

    if ($macros === []) {
        return;
    }

    expect(file_exists($root.'/extension.neon'))->toBeTrue('extension.neon is missing (bin/sync-shared)');

    $composer = json_decode((string) file_get_contents($root.'/composer.json'), true);
    expect($composer['extra']['phpstan']['includes'] ?? [])->toContain('extension.neon');

    $called = warpSharedCalledMethods((string) @file_get_contents($root.'/tests/PHPStan/Consumer.php'));

    foreach ($macros as $name) {
        expect(in_array($name, $called, true))->toBeTrue("tests/PHPStan/Consumer.php never calls ->{$name}()");
    }
});

it('declares every fluent setting of the plugin class with @method $this', function (): void {
    foreach (warpSharedMixinPlugins() as [$plugin, $settings, $doc]) {
        // __call で設定のクラスに渡すなら、@mixin で IDE・PHPStan に教える（無いと設定のメソッドが全部見えない）
        expect($settings)->not->toBeNull("{$plugin} forwards calls with __call but has no @mixin");

        $own = array_map(fn (ReflectionMethod $method): string => $method->name, (new ReflectionClass($plugin))->getMethods());
        $expected = [];

        foreach ((new ReflectionClass($settings))->getMethods(ReflectionMethod::IS_PUBLIC) as $method) {
            $returns = ltrim((string) $method->getReturnType(), '?');

            if ($method->isStatic() || str_starts_with($method->name, '__') || in_array($method->name, $own, true) || ! in_array($returns, ['static', 'self', $settings], true)) {
                continue;
            }

            $expected[$method->name] = warpSharedParameters($method);
        }

        preg_match_all('/@method\s+\$this\s+(\w+)\((.*)\)\s*$/m', $doc, $matches, PREG_SET_ORDER);
        $declared = [];

        foreach ($matches as [, $name, $parameters]) {
            $declared[$name] = $parameters;
        }

        ksort($expected);
        ksort($declared);

        expect($declared)->toBe($expected, "{$plugin}: the @method \$this lines differ from {$settings}'s fluent methods (names, types or defaults)");
    }

    expect(true)->toBeTrue();
});

it('leaves no PHPStan errors in code that uses the plugin (tests/PHPStan/Consumer.php)', function (): void {
    $root = warpSharedPackageRoot();

    if (! file_exists($root.'/tests/PHPStan/Consumer.php')) {
        expect(warpSharedOwnFilamentMacros())->toBe([])
            ->and(warpSharedMixinPlugins())->toBe([]);

        return;
    }

    expect(file_exists($root.'/vendor/bin/phpstan'))->toBeTrue('vendor/bin/phpstan is missing (composer install)');

    $includes = ['vendor/larastan/larastan/extension.neon'];

    if (file_exists($root.'/extension.neon')) {
        $includes[] = 'extension.neon';
    }

    $neon = "includes:\n".implode('', array_map(fn (string $path): string => "    - {$root}/{$path}\n", $includes))
        ."parameters:\n    level: 5\n    tmpDir: {$root}/vendor/.phpstan-consumer\n"
        ."    bootstrapFiles:\n        - {$root}/tests/PHPStan/bootstrap.php\n";

    $config = tempnam(sys_get_temp_dir(), 'warp-consumer-').'.neon';
    file_put_contents($config, $neon);

    $process = new Process([PHP_BINARY, '-d', 'memory_limit=-1', 'vendor/bin/phpstan', 'analyse', '-c', $config, 'tests/PHPStan/Consumer.php', '--no-progress', '--error-format=raw', '--memory-limit=-1'], $root, null, null, 300);
    $process->run();
    @unlink($config);

    expect($process->getExitCode())->toBe(0, "PHPStan found errors in tests/PHPStan/Consumer.php:\n".$process->getOutput().$process->getErrorOutput());
});
