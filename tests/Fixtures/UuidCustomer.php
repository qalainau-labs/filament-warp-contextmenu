<?php

namespace Qalainau\FilamentWarpContextMenu\Tests\Fixtures;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UuidCustomer extends Model
{
    use HasUuids;

    protected $table = 'uuid_customers';

    protected $guarded = [];

    /**
     * @return BelongsTo<UuidTeam, $this>
     */
    public function uuidTeam(): BelongsTo
    {
        return $this->belongsTo(UuidTeam::class);
    }
}
