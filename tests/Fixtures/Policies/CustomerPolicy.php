<?php

namespace Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Policies;

use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\Customer;
use Qalainau\FilamentWarpContextMenu\Tests\Fixtures\User;

/**
 * 止められる側の人：blocked@example.com はどの得意先も見られない。secret の得意先は誰も見られない。
 */
class CustomerPolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function view(User $user, Customer $customer): bool
    {
        return $user->email !== 'blocked@example.com' && ! $customer->secret;
    }

    public function delete(User $user, Customer $customer): bool
    {
        return $user->email !== 'blocked@example.com' && ! $customer->secret;
    }

    public function update(User $user, Customer $customer): bool
    {
        return $this->view($user, $customer);
    }
}
