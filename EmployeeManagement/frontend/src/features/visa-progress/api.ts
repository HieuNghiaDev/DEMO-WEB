import api from '../../services/api'
import type { VisaProgressDashboard } from './types'

export const getVisaProgress = async (refresh = false) => {
  const response = await api.get<{ data: VisaProgressDashboard }>('/visa-progress', {
    params: refresh ? { refresh: 1 } : undefined,
  })

  return response.data.data
}
