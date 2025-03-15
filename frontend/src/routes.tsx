// frontend/src/routes.tsx

import { lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import MainLayout from './components/layout/MainLayout';
import AuthLayout from './components/layout/AuthLayout';

// Lazy-loaded pages for better performance
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const ProjectsPage = lazy(() => import('./pages/projects/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('./pages/projects/ProjectDetailPage'));
const BlueprintUploadPage = lazy(() => import('./pages/projects/BlueprintUploadPage'));
const EstimatesPage = lazy(() => import('./pages/estimates/EstimatesPage'));
const EstimateDetailPage = lazy(() => import('./pages/estimates/EstimateDetailPage'));
const InventoryPage = lazy(() => import('./pages/inventory/InventoryPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

/**
 * Protected route wrapper that redirects to login if not authenticated
 */
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return null; // Or a loading spinner
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

/**
 * Routes that redirect to dashboard if already authenticated
 */
const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return null; // Or a loading spinner
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

const AppRoutes = () => {
  return (
    <Routes>
      {/* Auth routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<AuthRoute><LoginPage /></AuthRoute>} />
        <Route path="/register" element={<AuthRoute><RegisterPage /></AuthRoute>} />
        <Route path="/forgot-password" element={<AuthRoute><ForgotPasswordPage /></AuthRoute>} />
        <Route path="/reset-password" element={<AuthRoute><ResetPasswordPage /></AuthRoute>} />
      </Route>

      {/* Protected routes */}
      <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        
        {/* Projects */}
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/projects/:projectId/blueprint" element={<BlueprintUploadPage />} />
        
        {/* Estimates */}
        <Route path="/estimates" element={<EstimatesPage />} />
        <Route path="/estimates/:estimateId" element={<EstimateDetailPage />} />
        <Route path="/projects/:projectId/estimates" element={<EstimatesPage />} />
        <Route path="/projects/:projectId/estimates/:estimateId" element={<EstimateDetailPage />} />
        
        {/* Inventory */}
        <Route path="/inventory" element={<InventoryPage />} />
      </Route>

      {/* 404 page */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default AppRoutes;