// frontend/src/services/api.ts

import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { getAuthToken, clearAuthToken } from '../utils/auth';

// Create axios instance with default config
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth token
api.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for handling errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Handle 401 Unauthorized errors
    if (error.response?.status === 401) {
      // Clear auth token and redirect to login
      clearAuthToken();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Helper function to extract data from response
const extractData = <T>(response: AxiosResponse): T => {
  return response.data.data;
};

// Generic API request function
const request = async <T>(config: AxiosRequestConfig): Promise<T> => {
  try {
    const response = await api(config);
    return extractData<T>(response);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // Format and throw error message
      const message = error.response?.data?.error?.message || error.message;
      throw new Error(message);
    }
    throw error;
  }
};

// API functions
export const apiClient = {
  get: <T>(url: string, config?: AxiosRequestConfig) => {
    return request<T>({ ...config, method: 'get', url });
  },
  post: <T>(url: string, data?: any, config?: AxiosRequestConfig) => {
    return request<T>({ ...config, method: 'post', url, data });
  },
  put: <T>(url: string, data?: any, config?: AxiosRequestConfig) => {
    return request<T>({ ...config, method: 'put', url, data });
  },
  patch: <T>(url: string, data?: any, config?: AxiosRequestConfig) => {
    return request<T>({ ...config, method: 'patch', url, data });
  },
  delete: <T>(url: string, config?: AxiosRequestConfig) => {
    return request<T>({ ...config, method: 'delete', url });
  }
};

export default apiClient;