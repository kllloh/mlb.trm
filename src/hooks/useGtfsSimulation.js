import { useRef, useCallback, useEffect } from 'react'

// Day-of-week (0=Sun … 6=Sat) → trips file pattern
const PATTERN = ['sunday','weekday','weekday','weekday','weekday','friday','saturday']

/**
 * Compute how many ms have elapsed since Melbourne midnight today.
 * Computed once at call time so each animation frame only does Date.now() - offset.
 */
function computeMelbOffset() {
  const melbNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }))
  const secs = melbNow.getHours() * 3600 + melbNow.getMinutes() * 60 + melbNow.getSeconds()
  return Date.now() - secs * 1000   // melbMidnightMs
}

/**
 * Loads preprocessed GTFS data (public/tram-geometry.json + public/tram-trips-{day}.json)
 * and provides getPositions() — called every animation frame to return every active tram's
 * interpolated [lng, lat] position based on scheduled stop times.
 *
 * Returns { getPositions, ready } — ready turns true once JSON is loaded.
 */
export function useGtfsSimulation() {
  const tripsRef  = useRef(null)   // null until loaded
  const geoRef    = useRef(null)
  const offsetRef = useRef(computeMelbOffset())
  const readyRef  = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const melbNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }))
      const pat     = PATTERN[melbNow.getDay()]

      const base = import.meta.env.BASE_URL
      const [geoRes, tripRes] = await Promise.all([
        fetch(`${base}tram-geometry.json`),
        fetch(`${base}tram-trips-${pat}.json`),
      ])
      if (cancelled) return
      const [geo, tripData] = await Promise.all([geoRes.json(), tripRes.json()])
      if (cancelled) return

      // Pre-process: each trip = { rn, pts:[t0,i0,t1,i1,...], first, last }
      const trips = tripData.trips.map(([rn, , flatPts]) => ({
        rn:    String(rn),
        pts:   flatPts,
        first: flatPts[0],
        last:  flatPts[flatPts.length - 2],
      }))

      tripsRef.current  = trips
      geoRef.current    = geo.geometry
      offsetRef.current = computeMelbOffset()
      readyRef.current  = true
    }

    load().catch(console.error)
    return () => { cancelled = true }
  }, [])

  const getPositions = useCallback(() => {
    if (!tripsRef.current || !geoRef.current) return []

    const trips   = tripsRef.current
    const geo     = geoRef.current
    const nowSecs = (Date.now() - offsetRef.current) / 1000
    const result  = []

    for (const { rn, pts, first, last } of trips) {
      // Skip trips not running right now (3-min grace past last stop for trams still clearing)
      if (nowSecs < first || nowSecs > last + 180) continue

      // Binary search for the pair of scheduled stops bracketing nowSecs
      const n = pts.length >> 1   // number of stop entries
      let lo = 0, hi = n - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (pts[mid * 2] <= nowSecs) lo = mid; else hi = mid - 1
      }

      const prevT = pts[lo * 2],           prevI = pts[lo * 2 + 1]
      const nextT = pts[(lo + 1) * 2]   ?? prevT
      const nextI = pts[(lo + 1) * 2 + 1] ?? prevI

      // Linear interpolation between the two geometry indices
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
