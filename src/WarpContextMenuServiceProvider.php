<?php

namespace Qalainau\FilamentWarpContextMenu;

use Filament\Actions\Contracts\HasActions;
use Filament\Support\Facades\FilamentAsset;
use Filament\Support\Facades\FilamentView;
use Filament\Tables\Contracts\HasTable;
use Filament\Tables\View\TablesRenderHook;
use Livewire\Component;
use Livewire\EventBus;
use Livewire\Livewire;
use Qalainau\FilamentWarpContextMenu\Assets\ContextMenuAlpineComponent;
use Qalainau\FilamentWarpContextMenu\Assets\ContextMenuCss;
use Qalainau\FilamentWarpContextMenu\Support\Macros;
use Qalainau\FilamentWarpContextMenu\Support\Menus;
use Spatie\LaravelPackageTools\Package;
use Spatie\LaravelPackageTools\PackageServiceProvider;

class WarpContextMenuServiceProvider extends PackageServiceProvider
{
    public static string $name = 'filament-warp-contextmenu';

    public static string $assetPackage = 'qalainau/filament-warp-contextmenu';

    public function configurePackage(Package $package): void
    {
        $package->name(static::$name)->hasViews('warp-contextmenu');
    }

    public function packageBooted(): void
    {
        $this->loadTranslationsFrom(__DIR__.'/../resources/lang', 'warp-contextmenu');
        if ($this->app->runningInConsole()) {
            $this->publishes([__DIR__.'/../resources/lang' => $this->app->langPath('vendor/warp-contextmenu')], 'filament-warp-contextmenu-translations');
        }
        Macros::register();
        Support\EarlyAlpineComponents::register(['warpContextMenu']);
        FilamentAsset::register([
            ContextMenuCss::make('warp-contextmenu', __DIR__.'/../resources/dist/warp-contextmenu.css')->loadedOnRequest(),
            ContextMenuAlpineComponent::make('warp-contextmenu', __DIR__.'/../resources/dist/components/contextmenu.js')->loadedOnRequest(),
        ], static::$assetPackage);
        FilamentView::registerRenderHook(TablesRenderHook::CONTENT_BEFORE, function (array $data) {
            $table = $data['table'];
            if (! Menus::enabled($table)) {
                return '';
            }
            Menus::prepare($table);

            return view()->file(__DIR__.'/../resources/views/marker.blade.php', ['config' => Menus::clientConfig('record', $table)]);
        });
        // Filament resolves mountedActions during bootedInteractsWithTable(), before
        // a call hook. Preserve the snapshot, register menu actions after boot, and
        // ask Filament itself to resolve it again (including its record query).
        app(EventBus::class)->before('hydrate', function (Component $component): void {
            if ($component instanceof HasActions) {
                Macros::set($component, 'mounted', $component->mountedActions ?? []);
            }
        });
        app(EventBus::class)->after('hydrate', function (Component $component): void {
            if (! $component instanceof HasActions) {
                return;
            }
            if ($component instanceof HasTable && Menus::enabled($component->getTable())) {
                Menus::prepare($component->getTable());
            }
            Menus::pageActions($component);
            $mounted = Macros::get($component, 'mounted', []);
            if ($mounted !== [] && ($component->mountedActions ?? []) === []) {
                (function (array $mounted): void {
                    if (method_exists($this, 'cacheMountedActions') && property_exists($this, 'mountedActions') && $this->cacheMountedActions($mounted) !== []) {
                        $this->mountedActions = $mounted;
                    }
                })->call($component, $mounted);
            }
        });
        Livewire::listen('call', function (Component $component, $method, $params, $context, $returnEarly): void {
            if ($method === '__warpContextMenu') {
                $component->skipRender();
                $returnEarly(Menus::fetch($component, is_array($params[0] ?? null) ? $params[0] : [], is_string($params[1] ?? null) ? $params[1] : 'record'));

                return;
            }
            // A new request reconstructs the table before Filament resolves mounted actions.
            if (in_array($method, ['mountAction', 'callMountedAction'], true) && $component instanceof HasActions) {
                if ($component instanceof HasTable && Menus::enabled($component->getTable())) {
                    Menus::prepare($component->getTable());
                }
                Menus::pageActions($component);
            }
        });
    }
}
