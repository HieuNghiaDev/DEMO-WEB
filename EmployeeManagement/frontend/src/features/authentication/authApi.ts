import axios from 'axios'
import api, { captureAuthSession } from '../../services/api'
import { AuthFailure, type AuthTransport, type StepUpOperation, performStepUp } from './authFlow'

export const authTransport: AuthTransport = async (path, body, preAuth) => {
  try {
    const response = await api.post<unknown>(path, body, preAuth
      ? { headers: { Authorization: false }, withCredentials: false, timeout: 30_000 }
      : { timeout: 30_000 })
    return { status: response.status, data: response.data }
  } catch (error) {
    // Never propagate Axios config/request/body to an error boundary or telemetry.
    if (!preAuth && axios.isAxiosError(error) && [401, 419].includes(error.response?.status ?? 0)) {
      window.dispatchEvent(new Event('themis-auth-expired'))
    }
    throw new AuthFailure(axios.isAxiosError(error) ? error.response?.status : 0)
  }
}
export function withStepUp<T>(operation: StepUpOperation, password: string, otp: string, mutation: () => Promise<T>) {
  return performStepUp(authTransport, operation, password, otp, async () => {
    try { return await mutation() } catch (error) {
      const status = error instanceof AuthFailure ? error.status : axios.isAxiosError(error) ? error.response?.status : 0
      if (status === 401 || status === 419) window.dispatchEvent(new Event('themis-auth-expired'))
      throw new AuthFailure(status)
    }
  }, captureAuthSession())
}
