<?php

namespace Qalainau\FilamentWarpContextMenu\Tests\Fixtures;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * UUID のキーのテナント。
 */
class UuidTeam extends Model
{
    use HasUuids;

    protected $table = 'uuid_teams';

    protected $guarded = [];
}
