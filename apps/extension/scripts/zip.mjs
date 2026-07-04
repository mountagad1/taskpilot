import { createWriteStream, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dist = path.join(root, 'dist')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const zipName = `taskpilot-extension-v${pkg.version}.zip`
const zipPath = path.join(root, zipName)

// Zip the *contents* of dist/ (manifest.json must be at the archive root),
// not the dist/ directory itself.
execFileSync('zip', ['-r', '-X', zipPath, '.'], { cwd: dist, stdio: 'inherit' })

console.log(`[extension] packaged ${path.relative(process.cwd(), zipPath)}`)
