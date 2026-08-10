import axios from 'axios'

const api = axios.create({
  baseURL:
    import.meta.env.VITE_API_URL ??
    'http://127.0.0.1:8000/api',

  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
})

export default api