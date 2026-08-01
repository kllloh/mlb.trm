import { useRef, useEffect, useCallback } from 'react'
import { ptvGet } from '../lib/ptv'
import { ROUTE_LINES } from '../mock/routeLines'

// Same 25 CBD stops — every Melbourne tram route passes through here,
// so we discover all active run_refs from these alone.
const MONITORED_STOPS = [
  { id: 2091, lng: 144.95378, lat: -37.81696 },
  { id: 2087, lng: 144.95763, lat: -37.81586 },
  { id: 2067, lng: 144.95982, lat: -37.81523 },
  { id: 2029, lng: 144.96338, lat: -37.81420 },
  { id: 2077, lng: 144.96581, lat: -37.81350 },
  { id: 2071, lng: 144.96848, lat: -37.81270 },
  { id: 2076, lng: 144.97255, lat: -37.81151 },
  { id: 2496, lng: 144.95499, lat: -37.81884 },
  { id: 2494, lng: 144.95938, lat: -37.81756 },
  { id: 2492, lng: 144.96344, lat: -37.81639 },
  { id: 2491, lng: 144.96595, lat: -37.81568 },
  { id: 2488, lng: 144.97327, lat: -37.81353 },
  { id: 2722, lng: 144.96476, lat: -37.81771 },
  { id: 2721, lng: 144.96370, lat: -37.81549 },
  { id: 2720, lng: 144.96280, lat: -37.81354 },
  { id: 2718, lng: 144.96147, lat: -37.81064 },
  { id: 2258, lng: 144.95961, lat: -37.80662 },
  { id: 2208, lng: 144.96423, lat: -37.81038 },
  { id: 2206, lng: 144.96557, lat: -37.81330 },
  { id: 2205, lng: 144.96694, lat: -37.81625 },
  { id: 2204, lng: 144.96795, lat: -37.81847 },
  { id: 2863, lng: 144.96411, lat: -37.80954 },
  { id: 2869, lng: 144.94640, lat: -37.81460 },
  { id: 2203, lng: 144.96953, lat: -37.82193 },
  { id: 2198, lng: 144.97139, lat: -37.82833 },
]

const POLL_MS          = 30_000
const ARRIVAL_WINDOW   = 5 * 60_000
const REFIRE_MS        = 90_000
const CROSSING_WINDOW  = 8 * 60_000
const CROSSING_COOLDOWN = 30_000
const CONGESTION_THRESH = 2 * 60_000
const PATTERN_TTL      = 4 * 60 * 60_000   // reuse patterns for 4 h
const PATTERN_BATCH    = 20                 // parallel pattern fetches per cycle

const ALL_ROUTES = ['1','3','5','6','8','11','12','16','19','30','35','48','57','58','59','64','67','70','72','75','78','82','86','96','109','112']

function snapIndex(routeNumber, lng, lat) {
  const line = ROUTE_LINES[String(routeNumber)]
  if (!line?.length) return { index: 0 }
  let bestIdx = 0, bestD = Infinity
  for (let i = 0; i < line.length; i++) {
    const d = (line[i][0] - lng) ** 2 + (line[i][1] - lat) ** 2
    if (d < bestD) { bestD = d; bestIdx = i }
  }
  return { index: bestIdx }
}

export function useLiveTrams(onArrival, onCrossing, paused, onDisrupt) {
  // run_ref → { routeNumber, stops: [{t, index}], fetchedAt }
  const patternCache = useRef(new Map())
  // run_refs discovered but not yet fetched
  const pendingRefs  = useRef(new Map())  // run_ref → routeNumber

  const lastFired    = useRef(new Map())  // `${run_ref}-${stopId}` → ms
  const crossingLast = useRef(new Map())  // routeNumber → ms
  const congestedRef = useRef(new Set())

  const onArrivalRef  = useRef(onArrival)
  const onCrossingRef = useRef(onCrossing)
  const onDisruptRef  = useRef(onDisrupt)
  onArrivalRef.current  = onArrival
  onCrossingRef.current = onCrossing
  onDisruptRef.current  = onDisrupt

  // Fetch patterns for any pending run_refs in batches
  const drainPending = useCallback(async () => {
    const now = Date.now()
    const batch = [...pendingRefs.current.entries()].slice(0, PATTERN_BATCH)
    if (!batch.length) return

    await Promise.allSettled(batch.map(async ([run_ref, routeNumber]) => {
      pendingRefs.current.delete(run_ref)
      try {
        const data = await ptvGet(
          `/v3/pattern/run/${encodeURIComponent(run_ref)}/route_type/1?expand=stop`
        )
        const stops = (data.departures ?? [])
          .filter(d => d.scheduled_departure_utc)
          .map(d => {
            const s = data.stops?.[d.stop_id]
            if (!s) return null
            const { index } = snapIndex(routeNumber, s.stop_longitude, s.stop_latitude)
            return {
              t: new Date(d.estimated_departure_utc ?? d.scheduled_departure_utc).getTime(),
              index,
            }
          })
          .filter(Boolean)
          .sort((a, b) => a.t - b.t)

        if (stops.length >= 2) {
          patternCache.current.set(run_ref, { routeNumber, stops, fetchedAt: now })
        }
      } catch { /* network error — skip this run */ }
    }))
  }, [])

  // Main polling loop: discover run_refs and fire audio events
  const poll = useCallback(async () => {
    const now = Date.now()
    const routeDirs   = new Map()
    const routeDelays = new Map()

    const results = await Promise.allSettled(
      MONITORED_STOPS.map(stop =>
        ptvGet(`/v3/departures/route_type/1/stop/${stop.id}?max_results=40&expand=route`)
          .then(data => {
            const routesById = data.routes ?? {}
            return {
              stop,
              deps: data.departures.map(d => ({
                ...d,
                route_number: routesById[d.route_id]?.route_number ?? null,
              })),
            }
          })
      )
    )

    for (const r of results) {
      if (r.status !== 'fulfilled') continue
      const { stop, deps } = r.value

      for (const dep of deps) {
        const rn        = String(dep.route_number ?? dep.route_id)
        const scheduled = dep.scheduled_departure_utc
        const estimated = dep.estimated_departure_utc ?? scheduled
        if (!scheduled) continue

        const st    = new Date(scheduled).getTime()
        const et    = new Date(estimated).getTime()
        const delay = et - st

        // Queue pattern fetch if we haven't seen this run yet
        if (dep.run_ref && dep.route_number != null &&
            !patternCache.current.has(dep.run_ref) &&
            !pendingRefs.current.has(dep.run_ref)) {
          pendingRefs.current.set(dep.run_ref, dep.route_number)
        }

        // Congestion sampling
        if (!routeDelays.has(rn)) routeDelays.set(rn, [])
        routeDelays.get(rn).push(delay)

        // Crossing detection window
        if (et > now && et - now < CROSSING_WINDOW) {
          if (!routeDirs.has(rn)) routeDirs.set(rn, new Set())
          routeDirs.get(rn).add(dep.direction_id)
        }

        // Arrival audio trigger
        const key      = `${dep.run_ref}-${stop.id}`
        const imminent = et - now <= ARRIVAL_WINDOW && et > now - 10_000
        const canFire  = now - (lastFired.current.get(key) ?? 0) > REFIRE_MS
        if (imminent && canFire) {
          lastFired.current.set(key, now)
          onArrivalRef.current?.({
            routeNumber:        dep.route_number ?? dep.route_id,
            stopId:             stop.id,
            lng:                stop.lng,
            lat:                stop.lat,
            directionId:        dep.direction_id ?? 0,
            scheduledDeparture: estimated,
          })
        }
      }
    }

    // Expire stale patterns
    for (const [ref, p] of patternCache.current) {
      if (now - p.fetchedAt > PATTERN_TTL) patternCache.current.delete(ref)
    }

    // Crossings
    for (const [rn, dirs] of routeDirs) {
      if (dirs.size >= 2) {
        const last = crossingLast.current.get(rn) ?? 0
        if (now - last > CROSSING_COOLDOWN) {
          crossingLast.current.set(rn, now)
          onCrossingRef.current?.({ routeNumber: rn })
        }
      }
    }

    // Congestion state transitions
    const nowCongested = new Set()
    for (const [rn, delays] of routeDelays) {
      if (delays.reduce((a, b) => a + b, 0) / delays.length > CONGESTION_THRESH)
        nowCongested.add(rn)
    }
    for (const rn of nowCongested) {
      if (!congestedRef.current.has(rn)) {
        congestedRef.current.add(rn)
        onDisruptRef.current?.({ routeNumber: rn, kind: 'congestion', active: true })
      }
    }
    for (const rn of [...congestedRef.current]) {
      if (!nowCongested.has(rn)) {
        congestedRef.current.delete(rn)
        onDisruptRef.current?.({ routeNumber: rn, kind: 'congestion', active: false })
      }
    }

    // Fetch pending patterns in background
    drainPending()
  }, [drainPending])

  useEffect(() => {
    if (paused) return
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [poll, paused])

  // Simulated incidents
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
        const rn   = ALL_ROUTES[Math.floor(Math.random() * ALL_ROUTES.length)]
        const stop = MONITORED_STOPS[Math.floor(Math.random() * MONITORED_STOPS.length)]
        if (!active.has(rn)) {
          const until = Date.now() + (60 + Math.random() * 120) * 1000
          active.set(rn, until)
          onDisruptRef.current?.({ routeNumber: rn, kind: 'incident', active: true, lng: stop.lng, lat: stop.lat })
        }
      }
    }, 45_000)
    return () => clearInterval(id)
  }, [paused])

  // Called every animation frame by TramMap — must be fast
  const getPositions = useCallback(() => {
    const now = Date.now()
    const result = []

    for (const [run_ref, { routeNumber, stops }] of patternCache.current) {
      if (stops.length < 2) continue
      const first = stops[0].t
      const last  = stops[stops.length - 1].t
      if (now < first || now > last + 5 * 60_000) continue  // not started or long finished

      const line = ROUTE_LINES[String(routeNumber)]
      if (!line?.length) continue

      // Find the stop interval containing now
      let prev = stops[0], next = stops[1]
      for (let i = 1; i < stops.length; i++) {
        if (stops[i].t > now) { prev = stops[i - 1]; next = stops[i]; break }
        prev = next = stops[i]
      }

      const span = next.t - prev.t
      const frac = span > 0 ? Math.min(1, Math.max(0, (now - prev.t) / span)) : 1
      const idx  = Math.max(0, Math.min(line.length - 1,
        Math.round(prev.index + (next.index - prev.index) * frac)
      ))
      const [lng, lat] = line[idx]
      result.push({ id: run_ref, routeNumber: String(routeNumber), lng, lat })
    }

    return result
  }, [])

  return { getPositions }
}
