import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchDepartures } from '../lib/ptv'

// CBD tram stops covering the main corridors.
const MONITORED_STOPS = [
  { id: 2171, lng: 144.9665, lat: -37.8183 },  // Flinders St / Swanston St
  { id: 2961, lng: 144.9523, lat: -37.8183 },  // Spencer St / Collins St
  { id: 2177, lng: 144.9604, lat: -37.8129 },  // Elizabeth St / Bourke St
  { id: 3000, lng: 144.9665, lat: -37.8077 },  // La Trobe St / Swanston St
  { id: 2183, lng: 144.9641, lat: -37.8129 },  // Bourke St Mall / Swanston St
]

const STOP_COORDS = Object.fromEntries(MONITORED_STOPS.map(s => [s.id, { lng: s.lng, lat: s.lat }]))

const POLL_MS = 30_000

// Fires onArrival({ routeNumber, stopId, lng, lat, scheduledDeparture }) when
// a departure is detected. On the first poll, fires for any departure within
// the last 3 minutes so there's immediate feedback.
export function useTramDepartures(onArrival) {
  const [status, setStatus] = useState('idle') // idle | polling | error
  const prevDepartures = useRef({}) // key → ISO string
  const isFirstPoll = useRef(true)
  const onArrivalRef = useRef(onArrival)
  onArrivalRef.current = onArrival

  const poll = useCallback(async () => {
    setStatus('polling')
    const now = Date.now()
    const first = isFirstPoll.current
    if (first) isFirstPoll.current = false

    try {
      for (const stop of MONITORED_STOPS) {
        const departures = await fetchDepartures(stop.id)

        for (const dep of departures) {
          const key = `${dep.run_ref}-${stop.id}`
          const scheduled = dep.estimated_departure_utc ?? dep.scheduled_departure_utc
          if (!scheduled) continue

          const t = new Date(scheduled).getTime()
          const prev = prevDepartures.current[key]

          // Fire when a departure enters the "imminent" window (due within 60s)
          // and hasn't been fired before (no prev or prev was further away)
          const imminent = t - now <= 60_000 && t - now > -POLL_MS
          const notYetFired = !prev || new Date(prev).getTime() > now + 60_000

          if (imminent && notYetFired) {
            console.log(`[ptv] arrival route=${dep.route_number ?? dep.route_id} stop=${stop.id} in=${Math.round((t-now)/1000)}s`)
            onArrivalRef.current({
              routeNumber: dep.route_number ?? dep.route_id,
              stopId: stop.id,
              lng: stop.lng,
              lat: stop.lat,
              scheduledDeparture: scheduled,
            })
          }

          prevDepartures.current[key] = scheduled
        }
      }
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [poll])

  return status
}
