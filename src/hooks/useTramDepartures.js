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

// Fires onArrival({ routeNumber, stopId, scheduledDeparture }) when a
// departure time crosses from future to past between two polls.
export function useTramDepartures(onArrival) {
  const [status, setStatus] = useState('idle') // idle | polling | error
  const prevDepartures = useRef({}) // key → ISO string
  const onArrivalRef = useRef(onArrival)
  onArrivalRef.current = onArrival

  const poll = useCallback(async () => {
    setStatus('polling')
    const now = Date.now()

    try {
      for (const stop of MONITORED_STOPS) {
        const departures = await fetchDepartures(stop.id)

        for (const dep of departures) {
          const key = `${dep.run_ref}-${stop.id}`
          const scheduled = dep.estimated_departure_utc ?? dep.scheduled_departure_utc
          if (!scheduled) continue

          const t = new Date(scheduled).getTime()
          const prev = prevDepartures.current[key]

          // Was in the future last poll, now in the past → arrival
          if (prev && new Date(prev).getTime() > now - POLL_MS && t <= now) {
            onArrivalRef.current({
              routeNumber: dep.route?.route_number ?? dep.route_id,
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
