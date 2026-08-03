/**
 * Preprocess PTV tram GTFS data into compact schedule JSON files.
 * Run: node scripts/preprocess-gtfs.mjs
 *
 * Outputs:
 *   public/tram-geometry.json          route shapes (300 pts each, ~150 KB)
 *   public/tram-trips-weekday.json     Mon-Thu trips (~2 MB)
 *   public/tram-trips-friday.json      Friday trips (~2 MB)
 *   public/tram-trips-saturday.json    Saturday trips (~2 MB)
 *   public/tram-trips-sunday.json      Sunday trips (~2 MB)
 *
 * Trip format: [routeNumber, directionId, [t0,idx0, t1,idx1, ...]]
 *   t = seconds since midnight, idx = index into route geometry array
 */

import fs  from 'fs'
import path from 'path'
import rl  from 'readline'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GTFS    = path.join(__dirname, '../gtfs/3/google_transit')
const PUB     = path.join(__dirname, '../public')
const MAX_PTS = 300   // geometry points per route after subsampling

// Today as YYYYMMDD integer for date comparisons
const now      = new Date()
const todayNum = +`${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`

// ── CSV helpers ──────────────────────────────────────────────────────────────

const stripQ   = s => s.replace(/^"|"$/g, '').trim()
const stripBOM = s => s.replace(/^﻿/, '')

async function streamCSV(file, fn) {
  const iface = rl.createInterface({
    input: fs.createReadStream(path.join(GTFS, file), 'utf8'),
    crlfDelay: Infinity,
  })
  let headers = null, n = 0
  for await (const raw of iface) {
    const line = n++ === 0 ? stripBOM(raw) : raw
    if (!line.trim()) continue
    const cols = line.split(',').map(stripQ)
    if (!headers) { headers = cols; continue }
    fn(Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? ''])))
  }
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

const subsample = (pts, n) => {
  if (pts.length <= n) return pts
  const out = [], step = (pts.length - 1) / (n - 1)
  for (let i = 0; i < n; i++) out.push(pts[Math.round(i * step)])
  return out
}

const nearestIdx = (line, lng, lat) => {
  let best = 0, bestD = Infinity
  for (let i = 0; i < line.length; i++) {
    const d = (line[i][0]-lng)**2 + (line[i][1]-lat)**2
    if (d < bestD) { bestD = d; best = i }
  }
  return best
}

const toSecs = hms => {
  const [h, m, s] = hms.split(':').map(Number)
  return h*3600 + m*60 + (s||0)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Routes
  console.log('1/7  routes')
  const routeByid = {}
  await streamCSV('routes.txt', r => { routeByid[r.route_id] = r.route_short_name })

  // 2. Calendar — only keep services that are currently running
  //    (start_date <= today AND end_date >= today AND not a single-day service)
  console.log('2/7  calendar')
  const DAY_KEYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
  const svcDays  = {}   // service_id → Set of day indices (0=Sun..6=Sat)

  await streamCSV('calendar.txt', r => {
    const start = +r.start_date, end = +r.end_date
    // Skip expired services and one-day historical services
    if (end < todayNum) return
    if (start === end)  return   // one-off day, likely historical
    const days = new Set()
    DAY_KEYS.forEach((k, d) => { if (r[k] === '1') days.add(d) })
    if (days.size > 0) svcDays[r.service_id] = days
  })

  const activeServices = new Set(Object.keys(svcDays))
  console.log('   Active services:', [...activeServices].join(', '))

  // 3. Shapes
  console.log('3/7  shapes')
  const shapeRaw = {}
  await streamCSV('shapes.txt', r => {
    if (!shapeRaw[r.shape_id]) shapeRaw[r.shape_id] = []
    shapeRaw[r.shape_id].push({ seq: +r.shape_pt_sequence, lng: +r.shape_pt_lon, lat: +r.shape_pt_lat })
  })
  const shapeLines = {}
  for (const [id, pts] of Object.entries(shapeRaw)) {
    pts.sort((a, b) => a.seq - b.seq)
    shapeLines[id] = pts.map(p => [p.lng, p.lat])
  }
  console.log(`   ${Object.keys(shapeLines).length} shapes`)

  // 4. Trips — only keep active service_ids
  console.log('4/7  trips')
  const tripMeta = {}          // trip_id → { rn, dir, svc, shape }
  const routeShapeCount = {}   // rn → { shapeId → count }
  await streamCSV('trips.txt', r => {
    if (!activeServices.has(r.service_id)) return
    const rn = routeByid[r.route_id]
    if (!rn) return
    tripMeta[r.trip_id] = { rn, dir: +r.direction_id, svc: r.service_id, shape: r.shape_id }
    if (!routeShapeCount[rn]) routeShapeCount[rn] = {}
    routeShapeCount[rn][r.shape_id] = (routeShapeCount[rn][r.shape_id] ?? 0) + 1
  })
  console.log(`   ${Object.keys(tripMeta).length} active trips`)

  // 5. Route geometry — most-common shape per route, subsampled
  console.log('5/7  route geometry')
  const geometry = {}
  for (const [rn, counts] of Object.entries(routeShapeCount)) {
    const primaryId = Object.entries(counts).sort((a,b) => b[1]-a[1])[0]?.[0]
    if (primaryId && shapeLines[primaryId])
      geometry[rn] = subsample(shapeLines[primaryId], MAX_PTS)
  }
  console.log(`   ${Object.keys(geometry).length} routes`)

  // 6. Stops
  console.log('6/7  stops')
  const stopPos = {}
  await streamCSV('stops.txt', r => { stopPos[r.stop_id] = { lng: +r.stop_lon, lat: +r.stop_lat } })
  console.log(`   ${Object.keys(stopPos).length} stops`)

  // 7. Stop times — build per-trip stop list
  console.log('7/7  stop_times (please wait)')
  const tripStops = {}
  let n = 0
  await streamCSV('stop_times.txt', r => {
    if (++n % 500_000 === 0) process.stdout.write(`   ${(n/1e6).toFixed(1)}M\r`)
    const meta = tripMeta[r.trip_id]
    if (!meta) return
    const pos = stopPos[r.stop_id]
    if (!pos)  return
    const line = geometry[meta.rn]
    const idx  = line ? nearestIdx(line, pos.lng, pos.lat) : 0
    const t    = toSecs(r.departure_time)
    if (!tripStops[r.trip_id]) tripStops[r.trip_id] = []
    tripStops[r.trip_id].push({ seq: +r.stop_sequence, t, idx })
  })
  console.log(`\n   ${n.toLocaleString()} rows`)
  for (const s of Object.values(tripStops)) s.sort((a, b) => a.seq - b.seq)

  // ── Group trips by pattern ────────────────────────────────────────────────
  // Map day-sets to human patterns
  const dayPattern = days => {
    const d = [...days].sort().join(',')
    if (d === '5') return 'friday'
    if (d === '6') return 'saturday'
    if (d === '0') return 'sunday'
    return 'weekday'   // Mon-Thu (1,2,3,4) or any other weekday combo
  }

  // Build service_id → pattern
  const svcPattern = {}
  for (const [svc, days] of Object.entries(svcDays)) svcPattern[svc] = dayPattern(days)

  // Group trips
  const groups = { weekday:[], friday:[], saturday:[], sunday:[] }
  let skipped = 0
  for (const [tripId, meta] of Object.entries(tripMeta)) {
    const stops = tripStops[tripId]
    if (!stops || stops.length < 2) { skipped++; continue }
    const pat = svcPattern[meta.svc] ?? 'weekday'
    const flat = []
    for (const s of stops) { flat.push(s.t, s.idx) }
    groups[pat].push([meta.rn, meta.dir, flat])
  }

  console.log('Trips per pattern:', Object.entries(groups).map(([k,v])=>`${k}:${v.length}`).join(', '))
  console.log(`Skipped: ${skipped}`)

  // ── Write output files ────────────────────────────────────────────────────
  fs.mkdirSync(PUB, { recursive: true })

  // Geometry (shared)
  const geoJson = JSON.stringify({ generated: new Date().toISOString(), geometry })
  fs.writeFileSync(path.join(PUB, 'tram-geometry.json'), geoJson, 'utf8')
  console.log(`\npublic/tram-geometry.json  ${(geoJson.length/1024).toFixed(0)} KB`)

  // One trips file per pattern
  for (const [pat, trips] of Object.entries(groups)) {
    const json = JSON.stringify({ generated: new Date().toISOString(), trips })
    const outPath = path.join(PUB, `tram-trips-${pat}.json`)
    fs.writeFileSync(outPath, json, 'utf8')
    console.log(`public/tram-trips-${pat}.json  ${(json.length/1024/1024).toFixed(2)} MB  (${trips.length} trips)`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
