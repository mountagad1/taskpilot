// ============================================================
// TASKPILOT — EXTENSION PACKAGER
// apps/extension/scripts/zip.mjs
//
// Produces the Chrome Web Store upload archive from dist/.
//
// Written against Node's zlib rather than shelling out to `zip`: that binary
// is absent on stock Windows and on most CI images, and a packaging step
// that only runs on the maintainer's laptop is not a packaging step.
// ============================================================

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { deflateRawSync, crc32 } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dist = path.join(root, 'dist')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))

const zipName = `taskpilot-extension-v${pkg.version}.zip`
const zipPath = path.join(root, zipName)

// ─── COLLECT ─────────────────────────────────────────────────

/** Every file under dist/, as archive-relative POSIX paths. */
function collect(dir, prefix = '') {
  const entries = []

  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name)
    // The archive always uses forward slashes, whatever the host OS does.
    const rel = prefix ? `${prefix}/${name}` : name

    if (statSync(full).isDirectory()) entries.push(...collect(full, rel))
    else entries.push({ name: rel, data: readFileSync(full) })
  }

  return entries
}

// ─── ZIP ─────────────────────────────────────────────────────

/**
 * Minimal ZIP writer: a local header plus deflated data per entry, then a
 * central directory. Enough for the Web Store, which rejects anything
 * exotic anyway.
 */
function buildZip(entries) {
  const chunks = []
  const central = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8')
    const checksum = crc32(entry.data)

    const deflated = deflateRawSync(entry.data, { level: 9 })
    // Storing is smaller when deflate does not help — already-compressed PNGs.
    const stored = deflated.length >= entry.data.length
    const payload = stored ? entry.data : deflated
    const method = stored ? 0 : 8

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0) // local file header signature
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(0, 10) // mod time
    local.writeUInt16LE(0x21, 12) // mod date — fixed, so builds are reproducible
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28) // extra length

    chunks.push(local, nameBytes, payload)

    const header = Buffer.alloc(46)
    header.writeUInt32LE(0x02014b50, 0) // central directory signature
    header.writeUInt16LE(20, 4) // version made by
    header.writeUInt16LE(20, 6) // version needed
    header.writeUInt16LE(0, 8) // flags
    header.writeUInt16LE(method, 10)
    header.writeUInt16LE(0, 12) // mod time
    header.writeUInt16LE(0x21, 14) // mod date
    header.writeUInt32LE(checksum, 16)
    header.writeUInt32LE(payload.length, 20)
    header.writeUInt32LE(entry.data.length, 24)
    header.writeUInt16LE(nameBytes.length, 28)
    header.writeUInt16LE(0, 30) // extra
    header.writeUInt16LE(0, 32) // comment
    header.writeUInt16LE(0, 34) // disk number
    header.writeUInt16LE(0, 36) // internal attrs
    header.writeUInt32LE(0, 38) // external attrs
    header.writeUInt32LE(offset, 42)

    central.push(header, nameBytes)
    offset += local.length + nameBytes.length + payload.length
  }

  const centralBuffer = Buffer.concat(central)

  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0) // end of central directory
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuffer.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...chunks, centralBuffer, end])
}

// ─── RUN ─────────────────────────────────────────────────────

const entries = collect(dist)

// manifest.json must sit at the archive root, not inside a dist/ folder —
// the Web Store rejects the upload otherwise, with an unhelpful message.
if (!entries.some((entry) => entry.name === 'manifest.json')) {
  console.error('dist/manifest.json is missing — run `npm run build` first.')
  process.exit(1)
}

const archive = buildZip(entries)
writeFileSync(zipPath, archive)

const kb = (n) => `${(n / 1024).toFixed(1)} kB`

console.log(`[extension] packaged ${path.relative(process.cwd(), zipPath)} (${kb(archive.length)})`)
console.log(`[extension] ${entries.length} files:`)
for (const entry of entries) {
  console.log(`  ${entry.name.padEnd(24)} ${kb(entry.data.length)}`)
}
