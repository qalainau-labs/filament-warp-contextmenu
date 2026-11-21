// Warp Context Menu の JS と CSS を resources/dist にビルドする。
//
//   node bin/build.mjs          minify してビルドする
//   node bin/build.mjs --watch  変更を見張ってビルドし直す（inline sourcemap 付き）
//
//   resources/js/index.js            → resources/dist/components/contextmenu.js（Alpine の部品 warp-contextmenu-contextmenu）
//   resources/css/warp-contextmenu.css → resources/dist/warp-contextmenu.css
import * as esbuild from 'esbuild'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const isWatch = process.argv.includes('--watch')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const options = {
    entryPoints: [path.join(root, 'resources/js/index.js')],
    outfile: path.join(root, 'resources/dist/components/contextmenu.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2020'],
    minify: !isWatch,
    sourcemap: isWatch ? 'inline' : false,
    logLevel: 'info',
}

// CSS は resources/css の全部のファイルを 1 つにつなぐ（warp-contextmenu.css が先、あとは名前の順）
function buildCss() {
    const files = fs.readdirSync(path.join(root, 'resources/css')).filter((file) => file.endsWith('.css')).sort((a, b) => (a === 'warp-contextmenu.css' ? -1 : b === 'warp-contextmenu.css' ? 1 : a.localeCompare(b)))
    const css = files.map((file) => fs.readFileSync(path.join(root, 'resources/css', file), 'utf8').trim()).join('\n\n')

    fs.mkdirSync(path.join(root, 'resources/dist'), { recursive: true })
    fs.writeFileSync(path.join(root, 'resources/dist/warp-contextmenu.css'), css + '\n')
}

// Filament は登録したアセットを public/ にコピーして配信する。開発用アプリの中にあるときは、ビルドのたびにコピーし直す
const app = path.resolve(root, '../../..')

function publish() {
    if (fs.existsSync(path.join(app, 'artisan'))) {
        execSync('php artisan filament:assets', { cwd: app, stdio: 'ignore' })
    }
}

buildCss()

if (isWatch) {
    const ctx = await esbuild.context({ ...options, plugins: [{ name: 'publish', setup: (build) => build.onEnd(() => { buildCss(); publish() }) }] })
    await ctx.watch()
} else {
    await esbuild.build(options)
    publish()
}
