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

// The API origin is baked in at build time. Reading it from storage instead
// would let a compromised page repoint the extension at another server.
const apiOrigin =
  process.env.TASKPILOT_API_ORIGIN ?? (isDev ? 'http://localhost:4000' : 'https://api.taskpilot.cc')

// Where the user is sent for the dashboard, marketplace and sign-in. Since
// the backend split this is a different host from the API.
const webOrigin =
  process.env.TASKPILOT_WEB_ORIGIN ?? (isDev ? 'http://localhost:3000' : 'https://taskpilot.cc')

const shared = {
  bundle: true,
  minify: !isDev,
  sourcemap: isDev ? 'inline' : false,
  target: 'chrome116',
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': isDev ? '"development"' : '"production"',
    __TASKPILOT_API_ORIGIN__: JSON.stringify(apiOrigin),
    __TASKPILOT_WEB_ORIGIN__: JSON.stringify(webOrigin),
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
  {
    ...shared,
    entryPoints: [path.join(root, 'src/popup/index.ts')],
    outfile: path.join(dist, 'popup.js'),
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

  // A dev build must be able to reach a local server, and to accept a session
  // handed over from a locally running web app.
  // The extension must be permitted to reach the API host, and to accept a
  // session handed over from the web host. In production those are the two
  // taskpilot.cc subdomains already in the manifest; a dev build adds the
  // local origins.
  manifest.host_permissions = [...new Set([...manifest.host_permissions, `${apiOrigin}/*`])]
  manifest.externally_connectable.matches = [
    ...new Set([...manifest.externally_connectable.matches, `${webOrigin}/*`]),
  ]
  // Rebuild connect-src rather than prepending, so re-running the build (or
  // building for a different origin) cannot accumulate duplicate entries.
  manifest.content_security_policy.extension_pages = [
    "script-src 'self'",
    "object-src 'self'",
    `connect-src 'self' ${apiOrigin}`,
  ].join('; ')

  writeFileSync(path.join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`[extension] API origin: ${apiOrigin}`)
  console.log(`[extension] Web origin: ${webOrigin}`)
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
