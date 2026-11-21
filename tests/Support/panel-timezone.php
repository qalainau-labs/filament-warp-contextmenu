<?php

// 自動生成: Warp monorepo の shared/php-test/panel-timezone.php から bin/sync-shared でコピーしたもの。直すときは shared/ のほうを直す。

use Carbon\CarbonImmutable;
use Filament\Support\Facades\FilamentTimezone;
use Illuminate\Support\Carbon;

/*
 * 「パネルのタイムゾーンを見ずに、アプリの UTC で今日・日時を決める／出す」不具合を拾うための、Pest 用の小さな道具
 * （2026-11-21：Floor のデモ・Flow・Shift と続いた。shared/docs/test-escapes.md の [タイムゾーン]）。
 *
 * アプリは UTC のまま、パネルの FilamentTimezone だけを America/New_York などにし、時刻を UTC の深夜（既定は 2026-11-21 02:00。
 * ニューヨークではまだ 11-20 の 21:00）に止める。UTC の「今日」とパネルの「今日」が違う日になるので、
 * UTC で今日を決めている所・日時を変換せずに出している所は、パネルの今日・時刻と食い違って落ちる。
 * テストが終わったら（Laravel の後片付けで）元に戻す。
 *
 *   beforeEach(fn () => usePanelTimezoneAtUtcNight());                 // America/New_York・UTC 02:00
 *   it('…', function () {
 *       $clock = usePanelTimezoneAtUtcNight('Pacific/Auckland', '2026-11-21 14:00:00'); // 引数で変えられる
 *       expect($page->today)->toBe($clock['panelToday']);              // 例：'2026-11-20'。UTC の今日は $clock['utcToday']
 *   });
 *
 * 使うとき：プラグインの tests/Pest.php で `require_once __DIR__.'/Support/panel-timezone.php';`（bin/sync-shared が tests/Support/ に置く）。
 * 決まり：日付・時刻を出す・決める所を変えたら、この道具で UTC の深夜のテストを 1 本足す（shared/docs/test-writing.md）。
 *
 * @return array{panelToday: string, utcToday: string, panelNow: string, utcNow: string, timezone: string}
 */
if (! function_exists('usePanelTimezoneAtUtcNight')) {
    function usePanelTimezoneAtUtcNight(string $timezone = 'America/New_York', string $utcNow = '2026-11-21 02:00:00'): array
    {
        $utc = CarbonImmutable::parse($utcNow, 'UTC');
        $panel = $utc->setTimezone($timezone);

        // 日付が同じ時刻では、UTC で今日を決めても気づけない（道具の使い方の誤り）
        if ($utc->toDateString() === $panel->toDateString()) {
            throw new InvalidArgumentException("usePanelTimezoneAtUtcNight: {$utcNow} UTC は {$timezone} でも同じ日（{$panel->toDateString()}）です。UTC とパネルで日付がずれる時刻にしてください。");
        }

        config(['app.timezone' => 'UTC']);
        FilamentTimezone::set($timezone);
        CarbonImmutable::setTestNow($utc);
        Carbon::setTestNow(Carbon::parse($utcNow, 'UTC'));

        // Laravel のテストの後片付け（アプリを壊す直前）で、時刻とパネルのタイムゾーンを戻す
        test()->beforeApplicationDestroyed(function (): void {
            CarbonImmutable::setTestNow();
            Carbon::setTestNow();
            FilamentTimezone::set(null);
        });

        return [
            'panelToday' => $panel->toDateString(),
            'utcToday' => $utc->toDateString(),
            'panelNow' => $panel->format('Y-m-d H:i'),
            'utcNow' => $utc->format('Y-m-d H:i'),
            'timezone' => $timezone,
        ];
    }
}
