<div hidden data-warp-context-menu-kind="{{ $config['kind'] }}" data-warp-context-menu-config='@json($config)'
    x-load
    x-load-src="{{ \Filament\Support\Facades\FilamentAsset::getAlpineComponentSrc('warp-contextmenu', \Qalainau\FilamentWarpContextMenu\WarpContextMenuServiceProvider::$assetPackage) }}"
    x-data="warpContextMenu()"
></div>
