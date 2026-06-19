import { useMockDepartures } from './useMockDepartures'
import { useTramDepartures } from './useTramDepartures'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

// Both hooks accept (onArrival, onCrossing). The real PTV hook ignores onCrossing for now.
export const useDepartures = USE_MOCK ? useMockDepartures : useTramDepartures
