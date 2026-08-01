import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchDepartures } from '../lib/ptv'

// CBD + inner Melbourne tram stops — verified PTV stop IDs from GTFS stop_url
const MONITORED_STOPS = [
  // Bourke St (east-west)
  { id: 2091, lng: 144.95378, lat: -37.81696 },  // Spencer St/Bourke St
  { id: 2087, lng: 144.95763, lat: -37.81586 },  // William St/Bourke St
  { id: 2067, lng: 144.95982, lat: -37.81523 },  // Queen St/Bourke St
  { id: 2029, lng: 144.96338, lat: -37.81420 },  // Elizabeth St/Bourke St
  { id: 2077, lng: 144.96581, lat: -37.81350 },  // Swanston St/Bourke St
  { id: 2071, lng: 144.96848, lat: -37.81270 },  // Russell St/Bourke St
  { id: 2076, lng: 144.97255, lat: -37.81151 },  // Spring St/Bourke St
  // Collins St (east-west)
  { id: 2496, lng: 144.95499, lat: -37.81884 },  // Spencer St/Collins St
  { id: 2494, lng: 144.95938, lat: -37.81756 },  // William St/Collins St
  { id: 2492, lng: 144.96344, lat: -37.81639 },  // Elizabeth St/Collins St
  { id: 2491, lng: 144.96595, lat: -37.81568 },  // Melbourne Town Hall/Collins St
  { id: 2488, lng: 144.97327, lat: -37.81353 },  // Spring St/Collins St
  // Elizabeth St (north-south)
  { id: 2722, lng: 144.96476, lat: -37.81771 },  // Flinders St/Elizabeth St
  { id: 2721, lng: 144.96370, lat: -37.81549 },  // Collins St/Elizabeth St
  { id: 2720, lng: 144.96280, lat: -37.81354 },  // Bourke St Mall/Elizabeth St
  { id: 2718, lng: 144.96147, lat: -37.81064 },  // Melbourne Central/Elizabeth St
  { id: 2258, lng: 144.95961, lat: -37.80662 },  // Queen Victoria Market/Elizabeth St
  // Swanston St (north-south)
  { id: 2208, lng: 144.96423, lat: -37.81038 },  // Melbourne Central/Swanston St
  { id: 2206, lng: 144.96557, lat: -37.81330 },  // Bourke St Mall/Swanston St
  { id: 2205, lng: 144.96694, lat: -37.81625 },  // City Square/Swanston St
  { id: 2204, lng: 144.96795, lat: -37.81847 },  // Federation Square/Swanston St
  // La Trobe St (east-west)
  { id: 2863, lng: 144.96411, lat: -37.80954 },  // Melbourne Central/La Trobe St
  { id: 2869, lng: 144.94640, lat: -37.81460 },  // Docklands Stadium/La Trobe St
  // St Kilda Rd (south of CBD)
  { id: 2203, lng: 144.96953, lat: -37.82193 },  // Arts Precinct/St Kilda Rd
  { id: 2198, lng: 144.97139, lat: -37.82833 },  // Shrine of Remembrance/St Kilda Rd
]

const POLL_MS          = 10_000
const REFIRE_MS        = 90_000   // min gap before re-triggering the same tram/stop
const CROSSING_WINDOW  = 8 * 60_000   // look up to 8 min ahead for crossing detection
const ARRIVAL_WINDOW   = 5 * 60_000   // fire arrivals due within 5 min
const CROSSING_COOLDOWN = 30_000   // min gap between crossing fires per route
const CONGESTION_THRESH = 2 * 60_000  // 2+ min avg delay = congested

// Routes used for simulated incidents (all Melbourne tram route numbers)
const ALL_ROUTES = ['1','3','5','6','8','11','12','16','19','30','35','48','57','58','59','64','67','70','72','75','78','82','86','96','109','112']

export function useTramDepartures(onArrival, onCrossing, paused, onDisrupt) {
  const [status, setStatus]  = useState('idle')
  const lastFired    = useRef({})        // `${run_ref}-${stopId}` → ms
  const crossingLast = useRef({})        // routeNumber → ms
  const congestedRef = useRef(new Set()) // currently congested route numbers
  const onArrivalRef  = useRef(onArrival)
  const onCrossingRef = useRef(onCrossing)
  const onDisruptRef  = useRef(onDisrupt)
  onArrivalRef.current  = onArrival
  onCrossingRef.current = onCrossing
  onDisruptRef.current  = onDisrupt

  const poll = useCallback(async () => {
    setStatus('polling')
    const now = Date.now()

    // Route-level aggregation across all stops
    const routeDirs    = new Map()  // routeNumber → Set of direction_ids seen imminent
    const routeStops   = new Map()  // routeNumber → first stop seen (for crossing location)
    const routeDelays  = new Map()  // routeNumber → [delayMs, …]

    try {
      const results = await Promise.allSettled(
        MONITORED_STOPS.map(stop =>
          fetchDepartures(stop.id).then(deps => ({ stop, deps }))
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

          const st  = new Date(scheduled).getTime()
          const et  = new Date(estimated).getTime()
          const delay = et - st

          // Congestion: accumulate delay samples for this route
          if (!routeDelays.has(rn)) routeDelays.set(rn, [])
          routeDelays.get(rn).push(delay)

          // Crossing: track direction_ids seen in the imminent window
          if (et > now && et - now < CROSSING_WINDOW) {
            if (!routeDirs.has(rn)) routeDirs.set(rn, new Set())
            routeDirs.get(rn).add(dep.direction_id)
            if (!routeStops.has(rn)) routeStops.set(rn, stop)
          }

          // Arrival: fire when departure is due within ARRIVAL_WINDOW
          const key      = `${dep.run_ref}-${stop.id}`
          const imminent = et - now <= ARRIVAL_WINDOW && et > now - POLL_MS
          const canFire  = now - (lastFired.current[key] ?? 0) > REFIRE_MS

          if (imminent && canFire) {
            lastFired.current[key] = now
            onArrivalRef.current?.({
              routeNumber:       dep.route_number ?? dep.route_id,
              stopId:            stop.id,
              lng:               stop.lng,
              lat:               stop.lat,
              scheduledDeparture: estimated,
            })
          }
        }
      }

      // Fire crossings for routes with trams heading in both directions
      for (const [rn, dirs] of routeDirs) {
        if (dirs.size >= 2) {
          const last = crossingLast.current[rn] ?? 0
          if (now - last > CROSSING_COOLDOWN) {
            crossingLast.current[rn] = now
            const stop = routeStops.get(rn)
            onCrossingRef.current?.({ routeNumber: rn, lng: stop?.lng, lat: stop?.lat })
          }
        }
      }

      // Update congestion state — fire transitions only
      const nowCongested = new Set()
      for (const [rn, delays] of routeDelays) {
        const avg = delays.reduce((a, b) => a + b, 0) / delays.length
        if (avg > CONGESTION_THRESH) nowCongested.add(rn)
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

      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }, [])

  // Polling loop
  useEffect(() => {
    if (paused) return
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [poll, paused])

  // Simulated incidents — PTV basic API has no real-time disruption feed
  useEffect(() => {
    if (paused) return
    const active = new Map()  // routeNumber → expiresAt
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
          const until = now + (60 + Math.random() * 120) * 1000
          active.set(rn, until)
          onDisruptRef.current?.({ routeNumber: rn, kind: 'incident', active: true, lng: stop.lng, lat: stop.lat })
        }
      }
    }, 45_000)
    return () => clearInterval(id)
  }, [paused])

  return status
}
