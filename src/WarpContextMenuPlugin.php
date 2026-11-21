<?php

namespace Qalainau\FilamentWarpContextMenu;

use Filament\Contracts\Plugin;
use Filament\Facades\Filament;
use Filament\Panel;
use Filament\View\PanelsRenderHook;

class WarpContextMenuPlugin implements Plugin
{
    protected bool $hasPages = false;

    protected array $clipboardConfig = ['enabled' => false, 'limit' => 10, 'persist' => true];

    public function clipboard(bool $enabled = true, int $limit = 10, bool $persist = true): static
    {
        $this->clipboardConfig = ['enabled' => $enabled, 'limit' => max(0, $limit), 'persist' => $persist];

        return $this;
    }

    public function getClipboardConfig(): array
    {
        return $this->clipboardConfig;
    }

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
        $panel->renderHook(PanelsRenderHook::PAGE_END, fn () => ($this->hasPages || $this->clipboardConfig['enabled']) && Filament::auth()->check()
            ? view()->file(__DIR__.'/../resources/views/marker.blade.php', ['config' => Support\Menus::clientConfig($this->hasPages ? 'page' : 'clipboard')]) : '');
    }

    public function boot(Panel $panel): void {}
}
