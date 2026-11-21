<?php

namespace Qalainau\FilamentWarpContextMenu\Tests;

use BladeUI\Heroicons\BladeHeroiconsServiceProvider;
use BladeUI\Icons\BladeIconsServiceProvider;
use Filament\Actions\ActionsServiceProvider;
use Filament\FilamentServiceProvider;
use Filament\Forms\FormsServiceProvider;
use Filament\Infolists\InfolistsServiceProvider;
use Filament\Notifications\NotificationsServiceProvider;
use Filament\Schemas\SchemasServiceProvider;
use Filament\Support\SupportServiceProvider;
use Filament\Tables\TablesServiceProvider;
use Filament\Widgets\WidgetsServiceProvider;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Livewire\LivewireServiceProvider;
use Orchestra\Testbench\TestCase as Orchestra;
use Qalainau\FilamentWarpContextMenu\WarpContextMenuServiceProvider;

use function Orchestra\Testbench\load_migration_paths;

class TestCase extends Orchestra
{
    use RefreshDatabase;

    /**
     * @return array<int, class-string>
     */
    protected function getPackageProviders($app): array
    {
        return [
            BladeIconsServiceProvider::class,
            BladeHeroiconsServiceProvider::class,
            SupportServiceProvider::class,
            SchemasServiceProvider::class,
            ActionsServiceProvider::class,
            FormsServiceProvider::class,
            InfolistsServiceProvider::class,
            NotificationsServiceProvider::class,
            TablesServiceProvider::class,
            WidgetsServiceProvider::class,
            FilamentServiceProvider::class,
            // Livewire は Filament のあとに起動する（先だと、プロセスで最初のテストでダイアログが描かれない。flow の TestCase.php に詳しく）
            LivewireServiceProvider::class,
            WarpContextMenuServiceProvider::class,
            Fixtures\AdminPanelProvider::class,
            Fixtures\TeamPanelProvider::class,
            Fixtures\UuidPanelProvider::class,
        ];
    }

    /**
     * migration のフォルダを足すだけにし、migrate は RefreshDatabase に任せる（最初のテストで 1 回、あとはトランザクションで戻す）。
     * loadMigrationsFrom() だと 2 つ目のテストから、テストのたびに migrate とロールバックで全部の表を作り直す
     * （Herd の MariaDB では 1 テスト 1 秒かかり、Floor の 346 件で 28 分。直したら 21 秒。2026-11-07）。
     */
    protected function defineDatabaseMigrations(): void
    {
        load_migration_paths($this->app, __DIR__.'/database/migrations');
    }

    protected function setUp(): void
    {
        parent::setUp();

        Gate::policy(Fixtures\Customer::class, Fixtures\Policies\CustomerPolicy::class);
    }

    protected function defineEnvironment($app): void
    {
        Model::preventLazyLoading(); // 買った人のアプリが厳しいモードでも落ちないか（2 件以上の一覧で関連を読むと例外）

        // Livewire の暗号化に必要。固定値をリポジトリに置かないよう、テストのたびに生成する
        $app['config']->set('app.key', 'base64:'.base64_encode(random_bytes(32)));
        $app['config']->set('app.timezone', 'UTC');
        $app['config']->set('auth.providers.users.model', Fixtures\User::class);
        $app['config']->set('cache.default', 'array');

        // JSON の列や数の型は DB ごとに違いうるので、CI では WARP_CONTEXTMENU_TEST_DB で MySQL / PostgreSQL も試す。
        // DB 名は phpunit.xml の DB_DATABASE（SQLite 用の :memory:）とは別の WARP_CONTEXTMENU_TEST_DATABASE で渡す
        $app['config']->set('database.default', 'testing');
        $app['config']->set('database.connections.testing', match (env('WARP_CONTEXTMENU_TEST_DB', 'sqlite')) {
            'mysql' => [
                'driver' => 'mysql',
                'host' => env('DB_HOST', '127.0.0.1'),
                'port' => env('DB_PORT', 3306),
                'database' => env('WARP_CONTEXTMENU_TEST_DATABASE', 'testing'),
                'username' => env('DB_USERNAME', 'root'),
                'password' => env('DB_PASSWORD', ''),
                'charset' => 'utf8mb4',
                'collation' => 'utf8mb4_unicode_ci',
                'prefix' => '',
            ],
            // Herd の MariaDB も CI のサービスもポート 3307（3306 は MySQL）
            'mariadb' => [
                'driver' => 'mariadb',
                'host' => env('DB_HOST', '127.0.0.1'),
                'port' => env('WARP_MARIADB_PORT', 3307),
                'database' => env('WARP_CONTEXTMENU_TEST_DATABASE', 'testing'),
                'username' => env('DB_USERNAME', 'root'),
                'password' => env('DB_PASSWORD', ''),
                'charset' => 'utf8mb4',
                'collation' => 'utf8mb4_unicode_ci',
                'prefix' => '',
            ],
            'pgsql' => [
                'driver' => 'pgsql',
                'host' => env('DB_HOST', '127.0.0.1'),
                'port' => env('DB_PORT', 5432),
                'database' => env('WARP_CONTEXTMENU_TEST_DATABASE', 'testing'),
                'username' => env('DB_USERNAME', 'postgres'),
                'password' => env('DB_PASSWORD', 'postgres'),
                'charset' => 'utf8',
                'prefix' => '',
                'search_path' => 'public',
            ],
            default => [
                'driver' => 'sqlite',
                'database' => ':memory:',
                'prefix' => '',
            ],
        });
    }
}
