<?php

namespace Qalainau\FilamentWarpContextMenu\Tests\Fixtures;

use Illuminate\Database\Eloquent\Model;

/**
 * テナント付きのパネルのテナント（Filament の ->tenant(Team::class)）。
 */
class Team extends Model
{
    protected $table = 'teams';

    protected $guarded = [];
}
