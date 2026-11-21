<?php

// 自動生成: Warp monorepo の shared/phpstan/consumer-bootstrap.php から bin/sync-shared でコピーしたもの。直すときは shared/ のほうを直す。

/*
 * tests/PHPStan/Consumer.php の解析（SharedStaticAnalysisTest）で、Larastan が作ったアプリにこのプラグインのプロバイダーを登録する。
 * 買った人のアプリではパッケージの自動登録で入るが、プラグイン本体の Larastan（testbench）は何も登録しないので、マクロが空になる。
 */

$composer = json_decode((string) file_get_contents(dirname(__DIR__, 2).'/composer.json'), true);

foreach ($composer['extra']['laravel']['providers'] ?? [] as $provider) {
    app()->register($provider);
}
