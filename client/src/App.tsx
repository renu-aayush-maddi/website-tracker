import { lazy } from 'react';
import { Route, Routes } from 'react-router';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './layouts/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { SetupPage } from './pages/SetupPage';

// Route-level code splitting keeps the initial load small; charts load with the pages that use them.
const HomePage = lazy(() => import('./pages/HomePage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const WebsitesPage = lazy(() => import('./pages/WebsitesPage'));
const WebsiteFormPage = lazy(() => import('./pages/WebsiteFormPage'));
const WebsiteDetailPage = lazy(() => import('./pages/WebsiteDetailPage'));
const MonitoringPage = lazy(() => import('./pages/MonitoringPage'));
const LogsPage = lazy(() => import('./pages/LogsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="websites" element={<WebsitesPage />} />
        <Route path="websites/new" element={<WebsiteFormPage />} />
        <Route path="websites/:id" element={<WebsiteDetailPage />} />
        <Route path="websites/:id/edit" element={<WebsiteFormPage />} />
        <Route path="monitoring" element={<MonitoringPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
