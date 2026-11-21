<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password')->nullable();
            $table->rememberToken();
            $table->timestamps();
        });

        Schema::create('teams', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->timestamps();
        });

        Schema::create('team_user', function (Blueprint $table): void {
            $table->foreignId('team_id');
            $table->foreignId('user_id');
        });

        Schema::create('customers', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('team_id')->nullable();
            $table->string('name');
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->string('website')->nullable();
            $table->boolean('secret')->default(false);
            $table->softDeletes();
            $table->timestamps();
        });

        // UUID のテナントと記録（UuidTenancyTest）
        Schema::create('uuid_teams', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->timestamps();
        });

        Schema::create('uuid_team_user', function (Blueprint $table): void {
            $table->uuid('uuid_team_id');
            $table->foreignId('user_id');
        });

        Schema::create('uuid_customers', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('uuid_team_id')->nullable();
            $table->string('name');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['uuid_customers', 'uuid_team_user', 'uuid_teams', 'customers', 'team_user', 'teams', 'users'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
