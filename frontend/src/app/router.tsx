import { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Role } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Spinner } from '../components/ui';
import AuditPage from '../features/audit/AuditPage';
import AttendancePage from '../features/attendance/AttendancePage';
import TeamAttendancePage from '../features/attendance/TeamAttendancePage';
import ChangePasswordPage from '../features/auth/ChangePasswordPage';
import LoginPage from '../features/auth/LoginPage';
import DashboardPage from '../features/dashboard/DashboardPage';
import EmployeesPage from '../features/employees/EmployeesPage';
import ApprovalsPage from '../features/leave/ApprovalsPage';
import LeavePage from '../features/leave/LeavePage';
import ProfilePage from '../features/profile/ProfilePage';
import ReportsPage from '../features/reports/ReportsPage';
import PoliciesPage from '../features/settings/PoliciesPage';
import AppLayout from '../layouts/AppLayout';

function Protected({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (user && roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RequireAuth() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (user.must_change_password) return <Navigate to="/change-password" replace />;
  return <AppLayout />;
}

function NeedsLogin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

const STAFF: Role[] = ['OWNER', 'HR', 'REPORTING_MANAGER'];

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/change-password" element={<NeedsLogin><ChangePasswordPage /></NeedsLogin>} />
      <Route element={<RequireAuth />}>
        <Route index element={<DashboardPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="leave" element={<LeavePage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="team/attendance" element={<Protected roles={STAFF}><TeamAttendancePage /></Protected>} />
        <Route path="approvals" element={<Protected roles={STAFF}><ApprovalsPage /></Protected>} />
        <Route path="reports" element={<Protected roles={STAFF}><ReportsPage /></Protected>} />
        <Route path="employees" element={<Protected roles={['OWNER', 'HR']}><EmployeesPage /></Protected>} />
        <Route path="policies" element={<Protected roles={['OWNER', 'HR']}><PoliciesPage /></Protected>} />
        <Route path="audit" element={<Protected roles={['OWNER']}><AuditPage /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
