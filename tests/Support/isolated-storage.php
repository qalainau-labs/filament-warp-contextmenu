<?php

// 自動生成: Warp monorepo の shared/php-test/isolated-storage.php から bin/sync-shared でコピーしたもの。直すときは shared/ のほうを直す。

/*
 * テストのアプリの storage を、プロセスごとの一時のフォルダにする（2026-11-21：shared/docs/test-escapes.md の [揺れ]）。
 *
 * testbench のアプリの storage（vendor/orchestra/testbench-core/laravel/storage）は、同じプラグインのテストを同時に流す
 * ほかのプロセス（ほかのセッションの pest・Probe・bin/test-full）と同じフォルダになる。Storage::fake() はテストのたびに
 * テストのディスクのフォルダを消すので、こちらの途中のファイルが消えて落ちた（documents：hash_update_stream() に null・
 * UnableToRetrieveMetadata。2 つ同時に流すと再現）。Laravel は LARAVEL_STORAGE_PATH があれば、そこを storage にする。
 *
 * 使うとき：プラグインの tests/Pest.php の先頭で `require_once __DIR__.'/Support/isolated-storage.php';`
 * （bin/sync-shared が tests/Support/ に置き、bin/check-plugins が Pest.php に求める）。bin/test-strict の bootstrap も読む。
 * フォルダはプロセスが終わると消す。
 */
if (! function_exists('warpIsolateTestStorage')) {
    function warpIsolateTestStorage(): string
    {
        // 同じプロセスで 2 回呼ばれても（bootstrap と Pest.php）、同じフォルダのまま
        if (($_ENV['WARP_TEST_STORAGE_PID'] ?? null) === (string) getmypid() && isset($_ENV['LARAVEL_STORAGE_PATH'])) {
            return $_ENV['LARAVEL_STORAGE_PATH'];
        }

        $storage = sys_get_temp_dir().'/warp-test-storage/'.basename(getcwd()).'-'.getmypid().'-'.bin2hex(random_bytes(3));

        foreach (['framework/views', 'framework/cache/data', 'framework/sessions', 'framework/testing', 'logs', 'app/public'] as $folder) {
            @mkdir($storage.'/'.$folder, 0777, true);
        }

        $_ENV['LARAVEL_STORAGE_PATH'] = $_SERVER['LARAVEL_STORAGE_PATH'] = $storage;
        $_ENV['WARP_TEST_STORAGE_PID'] = (string) getmypid();
        putenv('LARAVEL_STORAGE_PATH='.$storage);

        $pid = getmypid();
        register_shutdown_function(static function () use ($storage, $pid): void {
            // 子のプロセス（pcntl_fork など）が終わるときには消さない
            if (getmypid() === $pid && is_dir($storage)) {
                exec('rm -rf '.escapeshellarg($storage));
            }
        });

        return $storage;
    }
}

warpIsolateTestStorage();
