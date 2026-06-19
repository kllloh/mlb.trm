import { useMockRoutes } from './useMockRoutes'
import { usePtvRoutes } from './usePtvRoutes'

// Resolved once at module load — safe to use as a stable hook reference
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
export const useRoutes = USE_MOCK ? useMockRoutes : usePtvRoutes
