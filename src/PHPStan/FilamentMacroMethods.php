<?php

// 自動生成: Warp monorepo の shared/php/PHPStan/FilamentMacroMethods.php から bin/sync-shared でコピーしたもの。直すときは shared/ のほうを直す。

namespace Qalainau\FilamentWarpContextMenu\PHPStan;

use Closure;
use Filament\Support\Concerns\Macroable;
use PHPStan\Reflection\ClassReflection;
use PHPStan\Reflection\MethodReflection;
use PHPStan\Reflection\MethodsClassReflectionExtension;
use PHPStan\Reflection\ReflectionProvider;
use PHPStan\Type\ClosureTypeFactory;
use PHPStan\Type\ObjectType;
use PHPStan\Type\ThisType;
use Throwable;

/**
 * PHPStan（Larastan）に、Filament の部品へ macro() で足したメソッドを教える。
 *
 * Filament の部品は Laravel の Macroable ではなく自前の Filament\Support\Concerns\Macroable を使うので、
 * Larastan はマクロを知らず「Call to an undefined method」になる。Larastan は解析の前にアプリを起動するので、
 * サービスプロバイダーが登録したマクロは $macros に入っている。それを読み、クロージャの引数と戻り値をそのまま使う。
 * Warp のマクロに限らず、アプリが自分で足した Filament のマクロにも効く。
 *
 * 戻り値が呼んだ部品の型を含むとき（マクロが $this を返すとき）は、呼んだ部品の型（$this）にする。
 * TextColumn::make()->macro() のあとにも TextColumn のメソッドを続けて書けるように。
 *
 * Warp のプラグインを 2 つ入れるとこの拡張も 2 つ登録されるが、先に答えたほうが使われるだけで、結果は同じ。
 */
final class FilamentMacroMethods implements MethodsClassReflectionExtension
{
    /** @var array<string, MethodReflection|null> */
    private array $found = [];

    public function __construct(private ReflectionProvider $reflectionProvider, private ClosureTypeFactory $closureTypeFactory) {}

    public function hasMethod(ClassReflection $classReflection, string $methodName): bool
    {
        return $this->find($classReflection, $methodName) !== null;
    }

    public function getMethod(ClassReflection $classReflection, string $methodName): MethodReflection
    {
        return $this->find($classReflection, $methodName) ?? throw new \LogicException("No Filament macro {$methodName}.");
    }

    private function find(ClassReflection $classReflection, string $methodName): ?MethodReflection
    {
        $key = $classReflection->getCacheKey().'::'.$methodName;

        if (array_key_exists($key, $this->found)) {
            return $this->found[$key];
        }

        return $this->found[$key] = $this->build($classReflection, $methodName);
    }

    private function build(ClassReflection $classReflection, string $methodName): ?MethodReflection
    {
        if (! trait_exists(Macroable::class) || ! array_key_exists(Macroable::class, $classReflection->getTraits(true))) {
            return null;
        }

        $macro = $this->macroFor($classReflection, $methodName);

        if ($macro === null) {
            return null;
        }

        try {
            $closure = $this->closureTypeFactory->fromClosureObject(Closure::fromCallable($macro));
        } catch (Throwable) {
            return null;
        }

        $returnType = $closure->getReturnType();
        $called = new ObjectType($classReflection->getName());

        if (! $returnType->isSuperTypeOf($called)->no()) {
            $returnType = new ThisType($classReflection);
        }

        return new FilamentMacroMethod($classReflection, $methodName, $closure->getParameters(), $closure->isVariadic(), $returnType);
    }

    /**
     * Filament の getMacro() と同じ順で探す：そのクラス、なければ親のクラス。
     * 値は Larastan と同じく、解析の前に起動したアプリが登録したもの（静的な $macros）を読む。
     */
    private function macroFor(ClassReflection $classReflection, string $methodName): ?callable
    {
        $native = $this->reflectionProvider->getClass($classReflection->getName())->getNativeReflection();

        if (! $native->hasProperty('macros')) {
            return null;
        }

        /** @var array<string, array<class-string, callable>> $macros */
        $macros = $native->getProperty('macros')->getValue();
        $candidates = $macros[$methodName] ?? [];

        foreach ([$classReflection->getName(), ...$classReflection->getParentClassesNames()] as $owner) {
            if (array_key_exists($owner, $candidates)) {
                return $candidates[$owner];
            }
        }

        return null;
    }
}
