import { useState, useEffect } from 'react'
import { fetchTramRoutes } from '../lib/ptv'
import { toneForRoute } from '../lib/routeTones'
import { ROUTE_LINES } from '../mock/routeLines'

// Builds GeoJSON from pre-extracted GTFS shape data (routeLines.js) so route
// lines follow actual track geometry. Route metadata still comes from the PTV API.
export function usePtvRoutes() {
  const [geojson, setGeojson] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const routes = await fetchTramRoutes()

        const features = routes
          .filter(r => ROUTE_LINES[String(r.route_number)])
          .map(route => {
            const coords = ROUTE_LINES[String(route.route_number)]
            const tone = toneForRoute(route.route_number)
            return {
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: coords },
              properties: {
                routeId: route.route_id,
                routeNumber: String(route.route_number),
                routeName: route.route_name,
                color: tone.color,
                note: tone.note,
              },
            }
          })

        if (!cancelled) {
          setGeojson({ type: 'FeatureCollection', features })
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  return { geojson, loading, error }
}
