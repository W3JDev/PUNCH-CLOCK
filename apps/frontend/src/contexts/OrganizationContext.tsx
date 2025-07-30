'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export interface Organization {
  id: string;
  businessName: string;
  orgCode: string;
  domain?: string;
  email?: string;
  phone?: string;
  isActive: boolean;
  isPremium: boolean;
}

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  organization: Organization;
}

export interface OrganizationContextType {
  user: User | null;
  organization: Organization | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (tokens: { accessToken: string; refreshToken: string }, userData: User) => void;
  logout: () => void;
  updateOrganization: (org: Partial<Organization>) => void;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

interface OrganizationProviderProps {
  children: ReactNode;
}

export const OrganizationProvider: React.FC<OrganizationProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        if (!token) {
          setIsLoading(false);
          return;
        }

        // Validate token and get user info
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data.user) {
            setUser(data.data.user);
            setOrganization(data.data.user.organization);
          } else {
            // Invalid token, clear storage
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
          }
        } else {
          // Token expired or invalid, clear storage
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = (tokens: { accessToken: string; refreshToken: string }, userData: User) => {
    localStorage.setItem('accessToken', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
    setUser(userData);
    setOrganization(userData.organization);
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
    setOrganization(null);
  };

  const updateOrganization = (orgUpdate: Partial<Organization>) => {
    if (organization) {
      const updatedOrg = { ...organization, ...orgUpdate };
      setOrganization(updatedOrg);
      
      // Update user's organization reference as well
      if (user) {
        setUser({ ...user, organization: updatedOrg });
      }
    }
  };

  const value: OrganizationContextType = {
    user,
    organization,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    updateOrganization
  };

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
};

export const useOrganization = (): OrganizationContextType => {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
};

// Hook for checking specific roles
export const useRole = () => {
  const { user } = useOrganization();
  
  const hasRole = (roles: string | string[]): boolean => {
    if (!user) return false;
    const roleArray = Array.isArray(roles) ? roles : [roles];
    return roleArray.includes(user.role);
  };

  const isSuperAdmin = () => hasRole('SUPER_ADMIN');
  const isOrgAdmin = () => hasRole(['SUPER_ADMIN', 'ORG_ADMIN']);
  const isHRManager = () => hasRole(['SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER']);
  const isManager = () => hasRole(['SUPER_ADMIN', 'ORG_ADMIN', 'HR_MANAGER', 'MANAGER']);

  return {
    user,
    hasRole,
    isSuperAdmin,
    isOrgAdmin,
    isHRManager,
    isManager
  };
};

// API client with automatic organization context
export const createOrgAPIClient = () => {
  const getToken = () => localStorage.getItem('accessToken');

  const apiCall = async (endpoint: string, options: RequestInit = {}) => {
    const token = getToken();
    const url = `${process.env.NEXT_PUBLIC_API_URL}${endpoint}`;
    
    const config: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...options.headers
      }
    };

    const response = await fetch(url, config);
    
    if (response.status === 401) {
      // Token expired, redirect to login
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
      throw new Error('Authentication required');
    }

    return response;
  };

  return {
    get: (endpoint: string, options?: RequestInit) => apiCall(endpoint, { ...options, method: 'GET' }),
    post: (endpoint: string, data?: any, options?: RequestInit) => 
      apiCall(endpoint, { ...options, method: 'POST', body: data ? JSON.stringify(data) : undefined }),
    put: (endpoint: string, data?: any, options?: RequestInit) => 
      apiCall(endpoint, { ...options, method: 'PUT', body: data ? JSON.stringify(data) : undefined }),
    delete: (endpoint: string, options?: RequestInit) => apiCall(endpoint, { ...options, method: 'DELETE' })
  };
};