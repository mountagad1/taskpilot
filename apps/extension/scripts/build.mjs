import esbuild from 'esbuild'
import { mkdirSync, rmSync, cpSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dist = path.join(root, 'dist')

rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })

const isWatch = process.argv.includes('--watch')
const isDev = process.argv.includes('--dev')

const shared = {
  bundle: true,
  minify: !isDev,
  sourcemap: false,
  target: 'chrome116',
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': isDev ? '"development"' : '"production"',
  },
}

const buildOpts = [
  {
    ...shared,
    entryPoints: [path.join(root, 'src/background/index.ts')],
    outfile: path.join(dist, 'background.js'),
    format: 'esm',
    platform: 'browser',
  },
  {
    ...shared,
    entryPoints: [path.join(root, 'src/content/index.ts')],
    outfile: path.join(dist, 'content.js'),
    format: 'iife',
    platform: 'browser',
  },
  {
    ...shared,
    entryPoints: [path.join(root, 'src/options/index.ts')],
    outfile: path.join(dist, 'options.js'),
    format: 'iife',
    platform: 'browser',
  },
]

async function copyStaticFiles() {
  cpSync(path.join(root, 'src/popup/popup.html'), path.join(dist, 'popup.html'))
  cpSync(path.join(root, 'src/sidebar/sidebar.html'), path.join(dist, 'sidebar.html'))
  cpSync(path.join(root, 'src/options/options.html'), path.join(dist, 'options.html'))
  cpSync(path.join(root, 'src/content/content.css'), path.join(dist, 'content.css'))
  cpSync(path.join(root, 'src/assets'), path.join(dist, 'assets'), { recursive: true })

  // Bump the manifest version to match package.json so they can't drift.
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'))
  manifest.version = pkg.version
  writeFileSync(path.join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
}

if (isWatch) {
  const contexts = await Promise.all(buildOpts.map((opts) => esbuild.context(opts)))
  await Promise.all(contexts.map((ctx) => ctx.watch()))
  await copyStaticFiles()
  console.log('[extension] watching for changes...')
} else {
  await Promise.all(buildOpts.map((opts) => esbuild.build(opts)))
  await copyStaticFiles()
  console.log(`[extension] built to ${path.relative(process.cwd(), dist)}`)
}
