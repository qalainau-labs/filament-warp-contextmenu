<?php

use Filament\Support\Facades\FilamentAsset;
use Qalainau\FilamentWarpContextMenu\WarpContextMenuServiceProvider;

it('loads JavaScript and CSS only on request and hashes both assets', function () {
    $package = WarpContextMenuServiceProvider::$assetPackage;
    $assets = [...FilamentAsset::getStyles([$package]), ...FilamentAsset::getAlpineComponents([$package])];
    expect($assets)->toHaveCount(2);
    foreach ($assets as $asset) {
        expect($asset->isLoadedOnRequest())->toBeTrue();
        expect($asset->getVersion())->toContain(substr(hash_file('xxh3', $asset->getPath()), 0, 8));
    }
});
