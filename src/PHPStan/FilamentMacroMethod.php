<?php

// 自動生成: Warp monorepo の shared/php/PHPStan/FilamentMacroMethod.php から bin/sync-shared でコピーしたもの。直すときは shared/ のほうを直す。

namespace Qalainau\FilamentWarpContextMenu\PHPStan;

use PHPStan\Reflection\ClassMemberReflection;
use PHPStan\Reflection\ClassReflection;
use PHPStan\Reflection\FunctionVariant;
use PHPStan\Reflection\MethodReflection;
use PHPStan\Reflection\ParameterReflection;
use PHPStan\TrinaryLogic;
use PHPStan\Type\Generic\TemplateTypeMap;
use PHPStan\Type\Type;

/**
 * FilamentMacroMethods が見つけたマクロ 1 つ（引数と戻り値はマクロのクロージャのもの）。
 */
final class FilamentMacroMethod implements MethodReflection
{
    /**
     * @param  list<ParameterReflection>  $parameters
     */
    public function __construct(
        private ClassReflection $classReflection,
        private string $name,
        private array $parameters,
        private bool $variadic,
        private Type $returnType,
    ) {}

    public function getDeclaringClass(): ClassReflection
    {
        return $this->classReflection;
    }

    public function isStatic(): bool
    {
        return false;
    }

    public function isPrivate(): bool
    {
        return false;
    }

    public function isPublic(): bool
    {
        return true;
    }

    public function getDocComment(): ?string
    {
        return null;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getPrototype(): ClassMemberReflection
    {
        return $this;
    }

    public function getVariants(): array
    {
        return [new FunctionVariant(TemplateTypeMap::createEmpty(), null, $this->parameters, $this->variadic, $this->returnType)];
    }

    public function isDeprecated(): TrinaryLogic
    {
        return TrinaryLogic::createNo();
    }

    public function getDeprecatedDescription(): ?string
    {
        return null;
    }

    public function isFinal(): TrinaryLogic
    {
        return TrinaryLogic::createNo();
    }

    public function isInternal(): TrinaryLogic
    {
        return TrinaryLogic::createNo();
    }

    public function getThrowType(): ?Type
    {
        return null;
    }

    public function hasSideEffects(): TrinaryLogic
    {
        return TrinaryLogic::createMaybe();
    }
}
