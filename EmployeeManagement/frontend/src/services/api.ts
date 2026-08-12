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

const backendUrl =
  import.meta.env.VITE_BACKEND_URL ??
  'http://localhost:8000'

const apiUrl =
  import.meta.env.VITE_API_URL ??
  `${backendUrl}/api`

const api = axios.create({
  baseURL: apiUrl,
  withCredentials: true,
  withXSRFToken: true,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
})

export const getCsrfCookie = async () => {
  await axios.get(
    `${backendUrl}/sanctum/csrf-cookie`,
    {
      withCredentials: true,
      withXSRFToken: true,
      headers: {
        Accept: 'application/json',
      },
    },
  )
}

export default api