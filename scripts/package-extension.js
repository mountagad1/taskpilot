#!/usr/bin/env node
/**
 * TaskPilot Extension Packager
 * Bundles the Chrome extension into a distributable ZIP for the Chrome Web Store.
 * Usage: node scripts/package-extension.js [--dev]
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const isDev = process.argv.includes('--dev')
const ROOT = path.join(__dirname, '..')
const EXT_SRC = path.join(ROOT, 'apps/extension')
const EXT_DIST = path.join(EXT_SRC, 'dist')
const OUTPUT_DIR = path.join(ROOT, 'dist')
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
const OUTPUT_FILE = path.join(OUTPUT_DIR, `taskpilot-extension-${isDev ? 'dev' : 'prod'}-${TIMESTAMP}.zip`)

console.log('\n🧩 TaskPilot Extension Packager')
console.log('━'.repeat(40))
console.log(`Mode: ${isDev ? 'Development' : 'Production'}`)
console.log(`Output: ${OUTPUT_FILE}\n`)

// ─── Step 1: Build the extension ──────────────
console.log('📦 Building extension...')
try {
  execSync('npm run build', {
    cwd: EXT_SRC,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: isDev ? 'development' : 'production' },
  })
  console.log('✅ Build complete\n')
} catch (err) {
  console.error('❌ Build failed:', err.message)
  process.exit(1)
}

// ─── Step 2: Validate dist ────────────────────
const requiredFiles = [
  'manifest.json',
  'background.js',
  'content.js',
  'popup.html',
  'sidebar.html',
]

console.log('🔍 Validating build output...')
const missing = requiredFiles.filter(
  (f) => !fs.existsSync(path.join(EXT_DIST, f))
)
if (missing.length > 0) {
  // Fallback: copy source files for manual review
  console.warn('⚠️  Some built files missing (may need Plasmo build):', missing)
  console.log('📁 Packaging source files instead...')
}

// ─── Step 3: Create output dir ────────────────
fs.mkdirSync(OUTPUT_DIR, { recursive: true })

// ─── Step 4: Determine source to package ──────
const packSource = fs.existsSync(EXT_DIST) && fs.readdirSync(EXT_DIST).length > 0
  ? EXT_DIST
  : EXT_SRC

// ─── Step 5: Create ZIP ───────────────────────
console.log('🗜️  Creating ZIP archive...')
try {
  const zip = require('child_process').execSync(
    `cd "${packSource}" && zip -r "${OUTPUT_FILE}" . -x "*.DS_Store" -x "node_modules/*" -x "src/*" -x ".env*"`,
    { stdio: 'pipe' }
  )
  console.log('✅ ZIP created successfully\n')
} catch (err) {
  // Fallback to tar if zip is not available
  try {
    execSync(
      `tar -czf "${OUTPUT_FILE.replace('.zip', '.tar.gz')}" -C "${packSource}" .`,
      { stdio: 'pipe' }
    )
    console.log('✅ TAR archive created (zip not available)\n')
  } catch (tarErr) {
    console.error('❌ Archive creation failed:', tarErr.message)
    process.exit(1)
  }
}

// ─── Step 6: Validate manifest ────────────────
const manifestPath = path.join(packSource, 'manifest.json')
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  console.log('📋 Extension Manifest Summary:')
  console.log(`  Name: ${manifest.name}`)
  console.log(`  Version: ${manifest.version}`)
  console.log(`  Manifest Version: ${manifest.manifest_version}`)
  console.log(`  Permissions: ${(manifest.permissions || []).join(', ')}\n`)

  // Chrome Web Store validation
  const issues = []
  if (manifest.manifest_version !== 3) issues.push('⚠️  Must use Manifest V3 for Chrome Web Store')
  if (!manifest.icons) issues.push('⚠️  Missing icons (required for CWS)')
  if (!manifest.description) issues.push('⚠️  Missing description')
  if ((manifest.description || '').length > 132) issues.push('⚠️  Description must be ≤ 132 chars')
  if (manifest.permissions?.includes('<all_urls>')) issues.push('⚠️  <all_urls> in required permissions may delay review — move to optional')

  if (issues.length) {
    console.log('⚠️  Chrome Web Store checklist:')
    issues.forEach((i) => console.log(`  ${i}`))
    console.log()
  } else {
    console.log('✅ Manifest passes basic CWS validation\n')
  }
}

// ─── Done ─────────────────────────────────────
const stats = fs.statSync(OUTPUT_FILE)
const sizeMB = (stats.size / 1024 / 1024).toFixed(2)
console.log('━'.repeat(40))
console.log(`✅ Package ready: ${path.basename(OUTPUT_FILE)}`)
console.log(`📦 Size: ${sizeMB} MB`)
console.log(`📍 Path: ${OUTPUT_FILE}`)
console.log('\n🚀 Upload to Chrome Web Store:')
console.log('   https://chrome.google.com/webstore/devconsole\n')
