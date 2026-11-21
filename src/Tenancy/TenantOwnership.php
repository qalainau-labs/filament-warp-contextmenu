<?php

// 自動生成: Warp monorepo の shared/php/Tenancy/TenantOwnership.php から bin/sync-shared でコピーしたもの。直すときは shared/ のほうを直す。

namespace Qalainau\FilamentWarpContextMenu\Tenancy;

use Filament\Exceptions\NoDefaultPanelSetException;
use Filament\Facades\Filament;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\Str;
use LogicException;

/**
 * 利用者のモデルを、テナントの持ち主の関係（Filament のパネルの ownership relationship）で今のテナントに絞り、
 * 新しいレコードをテナントに結び付ける。Filament のリソース（BelongsToTenant）と同じ規則にそろえる。
 *
 * - テナントのモデルそのものは、そのキーで絞る
 * - BelongsTo・MorphTo はその列で、多対多や中間テーブル経由（BelongsToMany・HasManyThrough など）は whereHas で絞る
 * - 同じ名前の列だけがあって関係の無いモデルは、関係が無いとみなす
 *
 * 関係が無いときにどうするか（例外にする・絞らない）は使う側で決める。has() か optional() で確かめてから scope() を呼ぶ。
 * 確かめずに scope()・associate()・save() を呼んで関係が無ければ、絞らずに進めないよう LogicException にする。
 *
 * @internal 公開 API ではない（どのリリースでも変わりうる）。
 */
final class TenantOwnership
{
    /**
     * 関係の名前。渡した名前、なければパネル（今のパネル、パネルの外では既定のパネル）の ownership relationship。
     * そのパネルにテナンシーが無い（パネルの外で Filament::setTenant() した）ときは、テナントのモデル名の camelCase
     * （Filament の既定と同じ）。
     */
    public static function name(?string $name = null, ?Model $tenant = null): string
    {
        if (filled($name)) {
            return $name;
        }

        try {
            $panel = Filament::getCurrentOrDefaultPanel();
        } catch (NoDefaultPanelSetException) {
            $panel = null;
        }

        if ($panel?->hasTenancy()) {
            return $panel->getTenantOwnershipRelationshipName();
        }

        $tenant ??= Filament::getTenant();

        return $tenant ? Str::camel(class_basename($tenant)) : '';
    }

    /**
     * モデルにその名前の関係があるか（同じ名前の列だけがあるときは関係とみなさない）。
     */
    public static function has(Model $model, string $relationship): bool
    {
        return $relationship !== '' && ! $model->hasAttribute($relationship) && $model->isRelation($relationship);
    }

    /**
     * テナントで分けないこともあるモデルの、関係の名前。
     *
     * - $required を渡したら、その関係が無いのは設定の誤りなので LogicException（黙って絞らずに、ほかのテナントのレコードを出さない）
     * - 渡さなければ $fallback（なければ name()）を使い、モデルにその関係が無ければ null（このモデルは関係では絞らない）
     *
     * @param  string  $hint  例外の文に足す、直し方（どの設定で名前を渡すか）
     */
    public static function optional(Model $model, ?string $required, ?string $fallback = null, string $hint = ''): ?string
    {
        if (filled($required)) {
            if (! self::has($model, $required)) {
                throw self::missing($model, $required, $hint);
            }

            return $required;
        }

        $name = filled($fallback) ? $fallback : self::name();

        return self::has($model, $name) ? $name : null;
    }

    /**
     * @template TModel of Model
     *
     * @param  Builder<TModel>  $query
     * @return Builder<TModel>
     */
    public static function scope(Builder $query, Model $tenant, string $relationship): Builder
    {
        $model = $query->getModel();

        if ($model::class === $tenant::class) {
            return $query->whereKey($tenant->getKey());
        }

        $relation = self::relation($model, $relationship);

        return match (true) {
            $relation instanceof MorphTo => $query->whereMorphedTo($relationship, $tenant),
            $relation instanceof BelongsTo => $query->whereBelongsTo($tenant, $relationship),
            default => $query->whereHas($relationship, fn (Builder $query): Builder => $query->whereKey($tenant->getKey())),
        };
    }

    /**
     * テナントで分けないこともあるモデルを絞る。テナントのモデルそのものはキーで絞り、ほかは optional() で関係が見つかれば絞る
     * （見つからなければ絞らない。$required を渡して関係が無ければ LogicException）。
     *
     * @template TModel of Model
     *
     * @param  Builder<TModel>  $query
     * @return Builder<TModel>
     */
    public static function scopeOptional(Builder $query, Model $tenant, ?string $required, ?string $fallback = null, string $hint = ''): Builder
    {
        $model = $query->getModel();

        if ($model::class === $tenant::class) {
            return $query->whereKey($tenant->getKey());
        }

        $relationship = self::optional($model, $required, $fallback, $hint);

        return $relationship === null ? $query : self::scope($query, $tenant, $relationship);
    }

    /**
     * 保存する前に、テナントを付ける（BelongsTo・MorphTo の列）。フォームの値に別のテナントのキーが入っていても、今のテナントで上書きする。
     */
    public static function associate(Model $record, Model $tenant, string $relationship): void
    {
        if ($record::class === $tenant::class) {
            return;
        }

        $relation = self::relation($record, $relationship);

        if ($relation instanceof BelongsTo) {
            $relation->associate($tenant);
        }
    }

    /**
     * 保存したあとに、テナントを付ける（多対多）。もう付いていれば何もしない。
     */
    public static function attach(Model $record, Model $tenant, string $relationship): void
    {
        if ($record::class === $tenant::class) {
            return;
        }

        $relation = self::relation($record, $relationship);

        if ($relation instanceof BelongsToMany) {
            $relation->syncWithoutDetaching([$tenant->getKey()]);
        }
    }

    /**
     * 新しいレコードを保存し、テナントに結び付ける。保存がモデルのイベントで止められたら false（多対多も付けない）。
     */
    public static function save(Model $record, Model $tenant, string $relationship): bool
    {
        self::associate($record, $tenant, $relationship);

        if (! $record->save()) {
            return false;
        }

        self::attach($record, $tenant, $relationship);

        return true;
    }

    /**
     * @return Relation<Model, Model, mixed>
     */
    private static function relation(Model $model, string $relationship): Relation
    {
        if (! self::has($model, $relationship)) {
            throw self::missing($model, $relationship);
        }

        return $model->{$relationship}();
    }

    private static function missing(Model $model, string $relationship, string $hint = ''): LogicException
    {
        return new LogicException(trim(sprintf('The model [%s] does not have a relationship named [%s] to the tenant. %s', $model::class, $relationship, $hint)));
    }
}
