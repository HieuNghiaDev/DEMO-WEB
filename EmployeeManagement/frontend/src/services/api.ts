// import axios from "axios";

// const api = axios.create({
//   baseURL: import.meta.env.VITE_API_URL,
//   headers: {
//     Accept: "application/json",
//     "Content-Type": "application/json",
//   },
// });

// export default api;
import axios from 'axios'

const AUTH_TOKEN_KEY = 'themis_auth_token'

const backendUrl =
  import.meta.env.VITE_BACKEND_URL ??
  'http://localhost:8000'

const apiUrl =
  import.meta.env.VITE_API_URL ??
  `${backendUrl}/api`

const api = axios.create({
  baseURL: apiUrl,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
})

const getAuthToken = () =>
  window.sessionStorage.getItem(AUTH_TOKEN_KEY) ??
  window.localStorage.getItem(AUTH_TOKEN_KEY)

export const hasAuthToken = () => getAuthToken() !== null

export const storeAuthToken = (token: string, remember: boolean) => {
  window.sessionStorage.removeItem(AUTH_TOKEN_KEY)
  window.localStorage.removeItem(AUTH_TOKEN_KEY)

  const storage = remember ? window.localStorage : window.sessionStorage
  storage.setItem(AUTH_TOKEN_KEY, token)
}

export const clearAuthToken = () => {
  window.sessionStorage.removeItem(AUTH_TOKEN_KEY)
  window.localStorage.removeItem(AUTH_TOKEN_KEY)
}

api.interceptors.request.use((config) => {
  const token = getAuthToken()

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

export default api
