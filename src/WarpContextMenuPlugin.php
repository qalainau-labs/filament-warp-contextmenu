<?php

namespace Qalainau\FilamentWarpContextMenu;

use Filament\Contracts\Plugin;
use Filament\Facades\Filament;
use Filament\Panel;
use Filament\View\PanelsRenderHook;

class WarpContextMenuPlugin implements Plugin
{
    protected bool $hasPages = false;

    public static function make(): static
    {
        return app(static::class);
    }

    public function getId(): string
    {
        return 'warp-contextmenu';
    }

    public function pages(bool $condition = true): static
    {
        $this->hasPages = $condition;

        return $this;
    }

    public function hasPages(): bool
    {
        return $this->hasPages;
    }

    public function register(Panel $panel): void
    {
        $panel->renderHook(PanelsRenderHook::PAGE_END, fn () => $this->hasPages && Filament::auth()->check()
            ? view()->file(__DIR__.'/../resources/views/marker.blade.php', ['config' => Support\Menus::clientConfig('page')]) : '');
    }

    public function boot(Panel $panel): void {}
}
