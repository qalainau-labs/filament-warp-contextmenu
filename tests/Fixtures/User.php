<?php

namespace Qalainau\FilamentWarpContextMenu\Tests\Fixtures;

use Filament\Models\Contracts\FilamentUser;
use Filament\Models\Contracts\HasTenants;
use Filament\Panel;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Support\Collection;

class User extends Authenticatable implements FilamentUser, HasTenants
{
    protected $table = 'users';

    protected $guarded = [];

    /** 認証（ログアウト・セッションの作り直し）が読む列。本物のアプリの users は取り出すと必ず持っている（厳しいモードで無い属性を読むと例外になる） */
    protected $attributes = ['remember_token' => null];

    public function canAccessPanel(Panel $panel): bool
    {
        return true;
    }

    /**
     * @return BelongsToMany<Team, $this>
     */
    public function teams(): BelongsToMany
    {
        return $this->belongsToMany(Team::class, 'team_user');
    }

    /**
     * @return BelongsToMany<UuidTeam, $this>
     */
    public function uuidTeams(): BelongsToMany
    {
        return $this->belongsToMany(UuidTeam::class, 'uuid_team_user');
    }

    public function getTenants(Panel $panel): Collection
    {
        return $panel->getId() === 'uuid' ? $this->uuidTeams : $this->teams;
    }

    public function canAccessTenant(Model $tenant): bool
    {
        return $tenant instanceof UuidTeam
            ? $this->uuidTeams()->whereKey($tenant->getKey())->exists()
            : $this->teams()->whereKey($tenant->getKey())->exists();
    }
}
