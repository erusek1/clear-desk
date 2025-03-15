// frontend/src/utils/auth.ts

import { jwtDecode } from 'jwt-decode';

// Constants
const TOKEN_KEY = import.meta.env.VITE_AUTH_STORAGE_KEY || 'clear_desk_token';
const REFRESH_TOKEN_KEY = import.meta.env.VITE_AUTH_REFRESH_KEY || 'clear_desk_refresh_token';
const TOKEN_EXPIRY_KEY = import.meta.env.VITE_AUTH_EXPIRY_KEY || 'clear_desk_token_expiry';

/**
 * JWT token payload interface
 */
export interface JwtPayload {
  id: string;
  email: string;
  companyId: string;
  role: string;
  exp: number;
}

/**
 * Get the auth token from local storage
 * 
 * @returns The auth token or null if not found
 */
export const getAuthToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

/**
 * Set the auth token in local storage
 * 
 * @param token - The auth token to store
 * @param expiresIn - Optional token expiration in seconds
 */
export const setAuthToken = (token: string, expiresIn?: number): void => {
  localStorage.setItem(TOKEN_KEY, token);
  
  if (expiresIn) {
    const expiryTime = Date.now() + expiresIn * 1000;
    localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
  }
};

/**
 * Clear the auth token from local storage
 */
export const clearAuthToken = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
};

/**
 * Get the refresh token from local storage
 * 
 * @returns The refresh token or null if not found
 */
export const getRefreshToken = (): string | null => {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
};

/**
 * Set the refresh token in local storage
 * 
 * @param token - The refresh token to store
 */
export const setRefreshToken = (token: string): void => {
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
};

/**
 * Check if the auth token is expired
 * 
 * @returns True if the token is expired or not found
 */
export const isTokenExpired = (): boolean => {
  const token = getAuthToken();
  if (!token) return true;
  
  try {
    const decodedToken = jwtDecode<JwtPayload>(token);
    const currentTime = Date.now() / 1000;
    
    return decodedToken.exp < currentTime;
  } catch (error) {
    console.error('Error decoding token:', error);
    return true;
  }
};

/**
 * Get the user information from the auth token
 * 
 * @returns The user information or null if token is invalid
 */
export const getUserFromToken = (): Omit<JwtPayload, 'exp'> | null => {
  const token = getAuthToken();
  if (!token) return null;
  
  try {
    const decodedToken = jwtDecode<JwtPayload>(token);
    const { id, email, companyId, role } = decodedToken;
    
    return { id, email, companyId, role };
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
};

/**
 * Check if the user is authenticated
 * 
 * @returns True if the user is authenticated
 */
export const isAuthenticated = (): boolean => {
  return !!getAuthToken() && !isTokenExpired();
};
