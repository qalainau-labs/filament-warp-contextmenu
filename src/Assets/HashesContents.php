<?php

// 自動生成: Warp monorepo の shared/php/Assets/HashesContents.php から bin/sync-shared でコピーしたもの。直すときは shared/ のほうを直す。

namespace Qalainau\FilamentWarpContextMenu\Assets;

/**
 * アセット URL の ?v= にファイル内容のハッシュを足す。
 *
 * Filament はパッケージのバージョン（パス指定のリポジトリでは常に "dev-main"）だけを付けるので、
 * プラグインを更新してもブラウザが古い JS / CSS をキャッシュから使い続けることがある。
 *
 * @internal 公開 API ではない（どのリリースでも変わりうる）。
 */
trait HashesContents
{
    protected ?string $contentHash = null;

    public function getVersion(): string
    {
        $this->contentHash ??= is_file($path = $this->getPath())
            ? substr(hash_file('xxh3', $path), 0, 8)
            : '';

        return rtrim(parent::getVersion().'.'.$this->contentHash, '.');
    }
}
