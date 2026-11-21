<?php

// 自動生成: Warp monorepo の shared/php/Support/EarlyAlpineComponents.php から bin/sync-shared でコピーしたもの。直すときは shared/ のほうを直す。

namespace Qalainau\FilamentWarpContextMenu\Support;

use Filament\Support\Facades\FilamentView;
use Illuminate\Support\HtmlString;
use InvalidArgumentException;

/**
 * `x-load` であとから読む Alpine の部品を、読み込みが終わる前に空の部品として登録しておく。
 *
 *   EarlyAlpineComponents::register(['warpTable']);   // ServiceProvider の boot から
 *
 * 理由：x-load は部品が届くまで要素に x-ignore を付けて x-data を評価させない。ところが Livewire の再描画の複製
 * （Alpine.cloneNode。x-data を持つ親の中の要素）は x-ignore を付けずに x-data を評価するので、部品が届く前だと
 * 「warpXxx is not defined」が console に出る（2026-11-19、Table 1.5.1・Context Menu 1.0.1）。
 * 空の部品を先に登録しておけば式は落ちず、部品が届くと x-load が本物に置き換える。
 *
 * 決まり：渡してよいのは **x-load であとから読む部品の名前（x-data で呼ぶ関数の名前）だけ**。ふつうに読む JS
 * （あとから本物を登録しない部品）を渡すと、空の部品が本物を潰す。渡す名前の漏れ・余りは、プラグインの
 * tests/Feature/Shared…Test.php（shared/tests/EarlyAlpineComponentsTest.php）が JS の元のファイルと突き合わせて見張る。
 *
 * @internal 公開 API ではない（どのリリースでも変わりうる）。
 */
final class EarlyAlpineComponents
{
    /** @var list<string> */
    private static array $names = [];

    /**
     * @param  list<string>  $names  x-data で呼ぶ関数の名前（例：warpTable）
     */
    public static function register(array $names): void
    {
        foreach ($names as $name) {
            if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $name) !== 1) {
                throw new InvalidArgumentException('Alpine の部品の名前は英数字と _ だけです。');
            }
        }

        $names = array_values(array_unique($names));
        self::$names = array_values(array_unique([...self::$names, ...$names]));

        if ($names === []) {
            return;
        }

        FilamentView::registerRenderHook(
            // パネルの hook 名（filament/panels には依存しないので、クラスの定数でなく文字で書く）
            'panels::scripts.before',
            // warp-safe-html: 名前は上で英数字と _ だけに絞った文字だけ（利用者の値は入らない）
            fn (): HtmlString => new HtmlString(self::script($names)),
        );
    }

    /**
     * これまでに register() に渡された名前（テスト用）。
     *
     * @return list<string>
     */
    public static function names(): array
    {
        return self::$names;
    }

    /**
     * @param  list<string>  $names
     */
    public static function script(array $names): string
    {
        // 名前は register() が英数字と _ だけに絞っているので、そのまま文字に入れてよい
        $calls = implode('', array_map(
            fn (string $name): string => "window.Alpine.data('{$name}',function(){return{}});",
            $names,
        ));

        return '<script>document.addEventListener(\'alpine:init\',function(){'.$calls.'})</script>';
    }
}
