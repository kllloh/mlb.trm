import { MOCK_ROUTES } from './mockData'

export const SECONDS_PER_STOP = 16   // base gap at 120 BPM

// Arrival rate scales with BPM: higher BPM → shorter gap between stops.
// At the default 120 BPM this equals SECONDS_PER_STOP exactly.
let secsBetweenStops = SECONDS_PER_STOP
export function setSimulatorBpm(bpm) {
  secsBetweenStops = SECONDS_PER_STOP * (120 / Math.max(1, bpm))
}

// ── Tram state ────────────────────────────────────────────────────────────────
function buildTrams() {
  const now = Date.now()
  return MOCK_ROUTES.flatMap(route => {
    const n = route.stops.length
    // Use real-world fleet size per route (derived from headway & route length).
    // Trams spread evenly across the route length in alternating directions.
    const count = route.tramCount ?? 8
    return Array.from({ length: count }, (_, i) => {
      const direction = i % 2 === 0 ? 1 : -1
      const stopIndex = Math.min(Math.floor((i / count) * n), n - 1)
      const delay = (i / count) * secsBetweenStops * 1000
      return {
        id:            `${route.routeNumber}_${i}`,
        routeNumber:   route.routeNumber,
        stops:         route.stops,
        stopIndex,
        direction,
        prevStopIndex: stopIndex,
        prevFireMs:    now - secsBetweenStops * 1000,
        nextFireMs:    now + delay,
      }
    })
  })
}

function indexByRoute(tramList) {
  const m = new Map()
  for (const t of tramList) {
    const rn = String(t.routeNumber)
    if (!m.has(rn)) m.set(rn, [])
    m.get(rn).push(t)
  }
  return m
}

let trams        = buildTrams()
let tramsByRoute = indexByRoute(trams)
let timer        = null
let onArrivalCb  = null
let onCrossingCb = null
let onDisruptCb  = null   // { routeNumber, kind: 'congestion'|'incident', active }

const crossingCooldowns = new Map()
const CROSSING_COOLDOWN_MS = 5_000

// ── Disruption state ──────────────────────────────────────────────────────────
// congestionMap: routeNumber → { factor, until }   (slows all trams on that route)
// incidentMap:   tram.id     → { until }            (stops that specific tram)
const congestionMap = new Map()
const incidentMap   = new Map()

// Probability per 500 ms tick (timer interval)
const P_CONGESTION = 0.018   // ~1 new congestion every ~28 s
const P_INCIDENT   = 0.006   // ~1 new incident    every ~83 s

function spawnCongestion(now) {
  const route = MOCK_ROUTES[Math.floor(Math.random() * MOCK_ROUTES.length)]
  const key   = String(route.routeNumber)
  if (congestionMap.has(key)) return
  const factor   = 2.5 + Math.random() * 2.5                // 2.5 – 5× slower
  const duration = (40  + Math.random() * 80) * 1000        // 40 – 120 s
  congestionMap.set(key, { factor, until: now + duration })
  onDisruptCb?.({ routeNumber: key, kind: 'congestion', active: true })
}

function spawnIncident(now) {
  const tram = trams[Math.floor(Math.random() * trams.length)]
  if (incidentMap.has(tram.id)) return
  const duration = (60 + Math.random() * 120) * 1000        // 60 – 180 s
  const stop = tram.stops[tram.prevStopIndex] ?? tram.stops[tram.stopIndex]
  incidentMap.set(tram.id, { until: now + duration })
  onDisruptCb?.({ routeNumber: String(tram.routeNumber), kind: 'incident', active: true, lng: stop?.lng, lat: stop?.lat })
}

// ── Main tick ─────────────────────────────────────────────────────────────────
function tick() {
  const now = Date.now()

  // Expire old disruptions
  for (const [key, ev] of congestionMap) {
    if (now >= ev.until) {
      congestionMap.delete(key)
      onDisruptCb?.({ routeNumber: key, kind: 'congestion', active: false })
    }
  }
  for (const [id, ev] of incidentMap) {
    if (now >= ev.until) {
      incidentMap.delete(id)
      const routeNumber = id.split('_')[0]
      onDisruptCb?.({ routeNumber, kind: 'incident', active: false })
    }
  }

  // Maybe spawn new disruptions
  if (Math.random() < P_CONGESTION) spawnCongestion(now)
  if (Math.random() < P_INCIDENT)   spawnIncident(now)

  // Move trams
  for (const tram of trams) {
    if (now < tram.nextFireMs) continue

    // Tram involved in an incident — hold in place until it clears
    if (incidentMap.has(tram.id)) {
      tram.nextFireMs = incidentMap.get(tram.id).until + Math.random() * 3000
      continue
    }

    // Fire arrival
    const stop = tram.stops[tram.stopIndex]
    if (onArrivalCb && stop) {
      onArrivalCb({
        routeNumber: tram.routeNumber,
        stopId:      stop.stopId,
        stopName:    stop.stopName,
        lng:         stop.lng,
        lat:         stop.lat,
        isCbdStop:   tram.stopIndex === 0,
        isInbound:   tram.direction === -1,
        isOutbound:  tram.direction === 1,
      })
    }

    // Record departure point for interpolation
    tram.prevStopIndex = tram.stopIndex
    tram.prevFireMs    = now

    // Advance to next stop, bounce at termini
    tram.stopIndex += tram.direction
    if (tram.stopIndex >= tram.stops.length) {
      tram.stopIndex = tram.stops.length - 2; tram.direction = -1
    } else if (tram.stopIndex < 0) {
      tram.stopIndex = 1; tram.direction = 1
    }

    // Schedule next — apply congestion factor if active on this route
    const cong   = congestionMap.get(String(tram.routeNumber))
    const factor = cong ? cong.factor : 1
    tram.nextFireMs = now + secsBetweenStops * factor * (0.7 + Math.random() * 0.6) * 1000
  }

  // Crossing detection — O(routes × trams_per_direction²) instead of O(n²)
  if (!onCrossingCb) return
  for (const [routeNumber, bucket] of tramsByRoute) {
    const out = bucket.filter(t => t.direction ===  1)
    const inn = bucket.filter(t => t.direction === -1)
    const last = crossingCooldowns.get(routeNumber) ?? 0
    if (now - last < CROSSING_COOLDOWN_MS) continue
    let found = false
    outer: for (const a of out) {
      for (const b of inn) {
        if (Math.abs(a.stopIndex - b.stopIndex) <= 1) { found = true; break outer }
      }
    }
    if (found) {
      crossingCooldowns.set(routeNumber, now)
      const rep  = out[0] ?? inn[0]
      const stop = rep.stops[rep.stopIndex]
      onCrossingCb({ routeNumber, lng: stop?.lng, lat: stop?.lat })
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns interpolated [lng, lat] for every active tram. Safe to call at any time. */
export function getTramPositions() {
  const now = Date.now()
  const result = []
  for (const tram of trams) {
    const from = tram.stops[tram.prevStopIndex]
    const to   = tram.stops[tram.stopIndex]
    if (!from || !to) continue
    const elapsed = now - tram.prevFireMs
    const total   = tram.nextFireMs - tram.prevFireMs
    const t       = total > 0 ? Math.min(1, Math.max(0, elapsed / total)) : 1
    result.push({
      id:          tram.id,
      routeNumber: String(tram.routeNumber),
      lng:         from.lng + (to.lng - from.lng) * t,
      lat:         from.lat + (to.lat - from.lat) * t,
      isIncident:  incidentMap.has(tram.id),
      isCongested: congestionMap.has(String(tram.routeNumber)),
    })
  }
  return result
}

export function startSimulator(onArrival, onCrossing, onDisrupt) {
  onArrivalCb  = onArrival
  onCrossingCb = onCrossing
  onDisruptCb  = onDisrupt
  trams        = buildTrams()
  tramsByRoute = indexByRoute(trams)
  crossingCooldowns.clear()
  congestionMap.clear()
  incidentMap.clear()
  if (timer) clearInterval(timer)
  timer = setInterval(tick, 500)
}

export function stopSimulator() {
  if (timer) { clearInterval(timer); timer = null }
  onArrivalCb = onCrossingCb = onDisruptCb = null
}
