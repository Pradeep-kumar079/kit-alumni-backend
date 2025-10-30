import axios from "axios";

const backendUrl = "https://kit-alumni-backend.onrender.com"; // ✅ correct backend URL

const api = axios.create({
  baseURL: backendUrl,
  withCredentials: true,
});

export default api;
