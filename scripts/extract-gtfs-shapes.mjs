/**
 * extract-gtfs-shapes.mjs
 *
 * Reads PTV GTFS files and writes src/mock/routeLines.js with accurate
 * tram route polylines.
 *
 * Usage:
 *   node scripts/extract-gtfs-shapes.mjs <path-to-gtfs-dir>
 *
 * The GTFS directory should contain (at minimum):
 *   routes.txt, trips.txt, shapes.txt
 *
 * Outputs: src/mock/routeLines.js
 *
 * Download PTV GTFS from:
 *   https://www.ptv.vic.gov.au/footer/data-and-reporting/datasets/gtfs/
 *   (requires free registration — download "Google Transit Feed")
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT      = resolve(__dirname, '..')

// ── CLI arg ───────────────────────────────────────────────────────────────────
const gtfsDir = process.argv[2]
if (!gtfsDir) {
  console.error('Usage: node scripts/extract-gtfs-shapes.mjs <path-to-gtfs-dir>')
  process.exit(1)
}
const dir = resolve(gtfsDir)
for (const f of ['routes.txt', 'trips.txt', 'shapes.txt']) {
  if (!existsSync(join(dir, f))) {
    console.error(`Missing: ${join(dir, f)}`)
    process.exit(1)
  }
}

// ── CSV parser (no deps) ──────────────────────────────────────────────────────
function parseCSV(path) {
  const lines  = readFileSync(path, 'utf8').replace(/\r/g, '').split('\n').filter(Boolean)
  const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
    const vals = splitCsvLine(line)
    const obj  = {}
    header.forEach((h, i) => { obj[h] = (vals[i] ?? '').replace(/^"|"$/g, '').trim() })
    return obj
  })
}

function splitCsvLine(line) {
  const result = []
  let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { result.push(cur); cur = '' }
    else { cur += ch }
  }
  result.push(cur)
  return result
}

// ── Ramer-Douglas-Peucker simplification ─────────────────────────────────────
function perpendicularDist([x, y], [x1, y1], [x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(x - x1, y - y1)
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2))
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
}

function rdp(points, epsilon) {
  if (points.length <= 2) return points
  let maxDist = 0, idx = 0
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDist(points[i], points[0], points[points.length - 1])
    if (d > maxDist) { maxDist = d; idx = i }
  }
  if (maxDist > epsilon) {
    const l = rdp(points.slice(0, idx + 1), epsilon)
    const r = rdp(points.slice(idx),        epsilon)
    return [...l.slice(0, -1), ...r]
  }
  return [points[0], points[points.length - 1]]
}

// ── Route short names we care about ──────────────────────────────────────────
const WANTED = new Set(['1','3','5','6','11','12','16','19','30','35','48','57','58','59','64','67','70','72','75','78','82','86','96','109'])

// ── Load GTFS ─────────────────────────────────────────────────────────────────
console.log('Loading routes.txt …')
const routes = parseCSV(join(dir, 'routes.txt'))
// route_type 0 = tram
const tramRoutes = routes.filter(r => r.route_type === '0')
console.log(`  ${tramRoutes.length} tram routes found`)

// Map short_name → route_id
const routeIdByName = {}
for (const r of tramRoutes) {
  const name = r.route_short_name?.trim()
  if (name) routeIdByName[name] = r.route_id
}

const missingRoutes = [...WANTED].filter(n => !routeIdByName[n])
if (missingRoutes.length) console.warn('  WARNING: no GTFS entry for routes:', missingRoutes.join(', '))

console.log('Loading trips.txt …')
const trips = parseCSV(join(dir, 'trips.txt'))

// For each wanted route, find one shape_id per direction (prefer direction_id=0)
const shapeByRoute = {}   // routeShortName → shape_id
for (const [name, routeId] of Object.entries(routeIdByName)) {
  if (!WANTED.has(name)) continue
  // Prefer direction_id=0; fall back to anything
  const candidates = trips.filter(t => t.route_id === routeId)
  const dir0 = candidates.find(t => t.direction_id === '0') ?? candidates[0]
  if (dir0?.shape_id) shapeByRoute[name] = dir0.shape_id
}

console.log('Loading shapes.txt …')
// shapes.txt can be huge — stream line by line instead of loading all into RAM
const wantedShapeIds = new Set(Object.values(shapeByRoute))
console.log(`  Extracting ${wantedShapeIds.size} shape(s) for ${Object.keys(shapeByRoute).length} routes …`)

const shapePoints = {}  // shape_id → [{seq, lng, lat}]

// Read in chunks to handle large files
const shapesPath = join(dir, 'shapes.txt')
const shapesText = readFileSync(shapesPath, 'utf8')
const shapeLines = shapesText.replace(/\r/g, '').split('\n')
const shapeHeader = shapeLines[0].split(',').map(h => h.trim())
const iId  = shapeHeader.indexOf('shape_id')
const iLat = shapeHeader.indexOf('shape_pt_lat')
const iLng = shapeHeader.indexOf('shape_pt_lon')
const iSeq = shapeHeader.indexOf('shape_pt_sequence')

console.log(`  shapes.txt: ${shapeLines.length.toLocaleString()} lines`)

for (let i = 1; i < shapeLines.length; i++) {
  const line = shapeLines[i]
  if (!line) continue
  const parts = line.split(',')
  const unq   = s => (s ?? '').trim().replace(/^"|"$/g, '')
  const id    = unq(parts[iId])
  if (!wantedShapeIds.has(id)) continue
  if (!shapePoints[id]) shapePoints[id] = []
  shapePoints[id].push({
    seq: parseInt(unq(parts[iSeq]), 10),
    lng: parseFloat(unq(parts[iLng])),
    lat: parseFloat(unq(parts[iLat])),
  })
}

// ── Build simplified polylines ────────────────────────────────────────────────
const EPSILON = 0.00015   // ~16 m
const ROUTE_LINES = {}

for (const [name, shapeId] of Object.entries(shapeByRoute)) {
  const pts = shapePoints[shapeId]
  if (!pts?.length) { console.warn(`  No shape points for route ${name} (shape ${shapeId})`); continue }
  pts.sort((a, b) => a.seq - b.seq)
  const raw  = pts.map(p => [p.lng, p.lat])
  const simp = rdp(raw, EPSILON)
  ROUTE_LINES[name] = simp
  console.log(`  Route ${name.padEnd(4)}: ${raw.length} pts → ${simp.length} after RDP`)
}

// ── Write output ──────────────────────────────────────────────────────────────
const outPath = join(ROOT, 'src', 'mock', 'routeLines.js')

const lines = [
  '// Auto-generated by scripts/extract-gtfs-shapes.mjs — do not edit by hand',
  '// Coordinates: [lng, lat] (WGS84), simplified with RDP ε=0.00015',
  '',
  'export const ROUTE_LINES = {',
]

for (const name of [...WANTED].sort((a, b) => Number(a) - Number(b))) {
  const coords = ROUTE_LINES[name]
  if (!coords) {
    lines.push(`  // '${name}': no shape found in GTFS`)
    continue
  }
  const coordStr = coords.map(([lng, lat]) => `[${lng},${lat}]`).join(',')
  lines.push(`  '${name}': [${coordStr}],`)
}

lines.push('}')
lines.push('')

writeFileSync(outPath, lines.join('\n'), 'utf8')
console.log(`\nWrote ${outPath}`)
console.log('Next: update src/mock/mockData.js to import ROUTE_LINES from ./routeLines.js')
