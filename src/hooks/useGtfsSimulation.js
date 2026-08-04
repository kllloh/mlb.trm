import { useRef, useCallback, useEffect } from 'react'

// Day-of-week (0=Sun … 6=Sat) → trips file pattern
const PATTERN = ['sunday','weekday','weekday','weekday','weekday','friday','saturday']

const ALL_ROUTES = ['1','3','5','6','8','11','12','16','19','30','35','48','57','58','59','64','67','70','72','75','78','82','86','96','109','112']
const POLL_MS           = 30_000
const CROSSING_COOLDOWN = 30_000

/**
 * Compute how many ms have elapsed since Melbourne midnight today.
 * Computed once at call time so each animation frame only does Date.now() - offset.
 */
function computeMelbOffset() {
  const melbNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }))
  const secs = melbNow.getHours() * 3600 + melbNow.getMinutes() * 60 + melbNow.getSeconds()
  return Date.now() - secs * 1000
}

/**
 * Full GTFS simulation — loads preprocessed schedule JSON, provides:
 *   - getPositions()  every active tram interpolated along its route (called each animation frame)
 *   - onArrival / onCrossing / onDisrupt  audio events driven from the schedule
 *
 * Matches the useLiveTrams signature so useDepartures can swap them.
 */
export function useGtfsSimulation(onArrival, onCrossing, paused, onDisrupt) {
  const tripsRef  = useRef(null)
  const geoRef    = useRef(null)
  const offsetRef = useRef(computeMelbOffset())

  const onArrivalRef  = useRef(onArrival)
  const onCrossingRef = useRef(onCrossing)
  const onDisruptRef  = useRef(onDisrupt)
  onArrivalRef.current  = onArrival
  onCrossingRef.current = onCrossing
  onDisruptRef.current  = onDisrupt

  const crossingCooldown = useRef(new Map())   // rn → lastFiredMs

  // ── Load GTFS data ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function load() {
      const melbNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }))
      const pat     = PATTERN[melbNow.getDay()]
      const base    = import.meta.env.BASE_URL

      const [geoRes, tripRes] = await Promise.all([
        fetch(`${base}tram-geometry.json`),
        fetch(`${base}tram-trips-${pat}.json`),
      ])
      if (cancelled) return
      const [geo, tripData] = await Promise.all([geoRes.json(), tripRes.json()])
      if (cancelled) return

      const trips = tripData.trips.map(([rn, dir, flatPts]) => ({
        rn:    String(rn),
        dir,
        pts:   flatPts,
        first: flatPts[0],
        last:  flatPts[flatPts.length - 2],
      }))

      tripsRef.current  = trips
      geoRef.current    = geo.geometry
      offsetRef.current = computeMelbOffset()
    }

    load().catch(console.error)
    return () => { cancelled = true }
  }, [])

  // ── Audio event driver — polls schedule every 30 s ────────────────────────
  useEffect(() => {
    if (paused) return

    const fire = () => {
      const trips = tripsRef.current
      if (!trips) return

      const nowSecs = (Date.now() - offsetRef.current) / 1000
      const now     = Date.now()
      const routeDirs = new Map()   // rn → Set<dir>

      for (const { rn, dir, first, last } of trips) {
        if (nowSecs < first || nowSecs > last + 180) continue
        if (!routeDirs.has(rn)) routeDirs.set(rn, new Set())
        routeDirs.get(rn).add(dir)
      }

      // Arrival event per active route (deduplicated by route in the tone-engine queue)
      for (const rn of routeDirs.keys()) {
        onArrivalRef.current?.({ routeNumber: rn })
      }

      // Crossing when both directions of a route are running simultaneously
      for (const [rn, dirs] of routeDirs) {
        if (dirs.size >= 2) {
          const last = crossingCooldown.current.get(rn) ?? 0
          if (now - last > CROSSING_COOLDOWN) {
            crossingCooldown.current.set(rn, now)
            onCrossingRef.current?.({ routeNumber: rn })
          }
        }
      }
    }

    fire()
    const id = setInterval(fire, POLL_MS)
    return () => clearInterval(id)
  }, [paused])

  // ── Simulated incidents ────────────────────────────────────────────────────
  useEffect(() => {
    if (paused) return
    const active = new Map()
    const id = setInterval(() => {
      const now = Date.now()
      for (const [rn, until] of [...active]) {
        if (now > until) {
          active.delete(rn)
          onDisruptRef.current?.({ routeNumber: rn, kind: 'incident', active: false })
        }
      }
      if (Math.random() < 0.12) {
        const rn = ALL_ROUTES[Math.floor(Math.random() * ALL_ROUTES.length)]
        if (!active.has(rn)) {
          const until = now + (60 + Math.random() * 120) * 1000
          active.set(rn, until)
          onDisruptRef.current?.({ routeNumber: rn, kind: 'incident', active: true, lng: 144.9631, lat: -37.8136 })
        }
      }
    }, 45_000)
    return () => clearInterval(id)
  }, [paused])

  // ── Position interpolation — called every animation frame ─────────────────
  const getPositions = useCallback(() => {
    if (!tripsRef.current || !geoRef.current) return []

    const trips   = tripsRef.current
    const geo     = geoRef.current
    const nowSecs = (Date.now() - offsetRef.current) / 1000
    const result  = []

    for (const { rn, pts, first, last } of trips) {
      if (nowSecs < first || nowSecs > last + 180) continue

      const n = pts.length >> 1
      let lo = 0, hi = n - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (pts[mid * 2] <= nowSecs) lo = mid; else hi = mid - 1
      }

      const prevT = pts[lo * 2],           prevI = pts[lo * 2 + 1]
      const nextT = pts[(lo + 1) * 2]   ?? prevT
      const nextI = pts[(lo + 1) * 2 + 1] ?? prevI

      const span = nextT - prevT
      const frac = span > 0 ? (nowSecs - prevT) / span : 1
      const idx  = prevI + (nextI - prevI) * frac

      const line = geo[rn]
      if (!line) continue

      const clamped    = Math.max(0, Math.min(line.length - 1, Math.round(idx)))
      const [lng, lat] = line[clamped]
      result.push({ routeNumber: rn, lng, lat })
    }

    return result
  }, [])

  return { getPositions }
}
