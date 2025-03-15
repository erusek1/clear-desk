// frontend/src/contexts/AuthContext.tsx

import { createContext, useCallback, useEffect, useMemo, useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { 
  getUserFromToken, 
  isAuthenticated as checkIsAuthenticated, 
  setAuthToken, 
  setRefreshToken, 
  clearAuthToken
} from '../utils/auth';
import { toast } from 'react-hot-toast';

/**
 * User interface
 */
interface User {
  id: string;
  email: string;
  companyId: string;
  role: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Login credentials interface
 */
interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Authentication context interface
 */
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

// Create the context with default values
export const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  logout: () => {},
  refreshUser: async () => {}
});

/**
 * Authentication context provider
 */
const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const navigate = useNavigate();

  // Check if the user is authenticated
  const isAuthenticated = useMemo(() => {
    return checkIsAuthenticated();
  }, [user]);

  // Initialize user from token on mount
  useEffect(() => {
    const initializeAuth = () => {
      const userData = getUserFromToken();
      setUser(userData);
      setIsLoading(false);
    };

    initializeAuth();
  }, []);

  /**
   * Login user with credentials
   * 
   * @param credentials - User credentials
   */
  const login = useCallback(async (credentials: LoginCredentials) => {
    try {
      setIsLoading(true);
      
      // Call login API
      const response = await apiClient.post<{ token: string; refreshToken: string; user: User }>('/auth/login', credentials);
      
      // Store tokens
      setAuthToken(response.token);
      setRefreshToken(response.refreshToken);
      
      // Set user state
      setUser(response.user);
      
      toast.success('Login successful');
      navigate('/dashboard');
    } catch (error) {
      toast.error((error as Error).message || 'Login failed');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  /**
   * Logout user
   */
  const logout = useCallback(() => {
    clearAuthToken();
    setUser(null);
    navigate('/login');
    toast.success('Logged out successfully');
  }, [navigate]);

  /**
   * Refresh user data from the server
   */
  const refreshUser = useCallback(async () => {
    try {
      if (!isAuthenticated) return;
      
      setIsLoading(true);
      
      // Call user profile API
      const userData = await apiClient.get<User>('/auth/me');
      
      setUser(userData);
    } catch (error) {
      console.error('Error refreshing user data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // Context value
  const contextValue = useMemo(() => ({
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    refreshUser
  }), [user, isAuthenticated, isLoading, login, logout, refreshUser]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;