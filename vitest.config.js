// パッケージの JS のテスト。開発用アプリの vite.config.js を拾わないよう、ここに置く
export default {
    test: {
        include: ['tests/js/**/*.test.js'],
    },
}
