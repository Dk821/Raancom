export type Role = 'OWNER' | 'HR' | 'REPORTING_MANAGER' | 'EMPLOYEE';

export interface Me {
  id: number;
  email: string;
  role: Role;
  must_change_password: boolean;
  employee: {
    id: number;
    employee_code: string;
    full_name: string;
    department: string | null;
    designation: string | null;
    manager_id: number | null;
    joining_date: string;
  };
  permissions: {
    manage_employees: boolean;
    edit_company_policy: boolean;
    edit_leave_policy: boolean;
    view_reports: boolean;
    approve_requests: boolean;
    view_audit: boolean;
  };
  company: { name: string; timezone: string };
}

export interface Employee {
  id: number;
  employee_code: string;
  full_name: string;
  email: string;
  role: Role;
  department: string | null;
  designation: string | null;
  joining_date: string;
  manager_id: number | null;
  manager_name: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  is_active: boolean;
  phone: string | null;
  address?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  last_login_at?: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export type DayStatus =
  | 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'LEAVE' | 'HOLIDAY' | 'WEEKLY_OFF'
  | 'INCOMPLETE' | 'CHECKED_IN' | 'NOT_MARKED';

export type Mode = 'OFFICE' | 'OUTSIDE_WORK' | 'WFH';

export interface DayRow {
  employee_id: number;
  employee_code: string;
  employee_name: string;
  department: string | null;
  date: string;
  status: DayStatus;
  check_in: string | null;
  check_out: string | null;
  worked_minutes: number | null;
  mode: Mode | null;
  late: boolean;
  late_minutes: number;
  geofence_status: string | null;
  review_status: string | null;
  check_in_event_id: number | null;
  check_out_event_id: number | null;
  distance_m: number | null;
  leave_type: string | null;
  holiday: string | null;
  corrected: boolean;
  shift: string;
}

export interface Summary {
  days: number; present: number; half_day: number; absent: number; leave: number; holiday: number;
  weekly_off: number; incomplete: number; checked_in: number; not_marked: number; late_count: number;
  worked_minutes: number; payable_days: number; late_half_day_deductions?: number;
}

export interface AttEvent {
  id: number;
  employee_id: number;
  attendance_date: string;
  event_type: 'CHECK_IN' | 'CHECK_OUT';
  mode: Mode;
  occurred_at: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  office_name: string | null;
  distance_m: number | null;
  radius_m: number | null;
  geofence_status: string;
  remark: string | null;
  review_status: string;
  flag_reasons: string[];
  review_note: string | null;
  reviewed_at: string | null;
  employee_name?: string;
  employee_code?: string;
}

export interface TodayState {
  date: string;
  state: 'NOT_STARTED' | 'CHECKED_IN' | 'COMPLETED' | 'STALE';
  can_check_in: boolean;
  can_check_out: boolean;
  check_in: AttEvent | null;
  check_out: AttEvent | null;
  day: DayRow | null;
  offices: { id: number; name: string; radius_m: number }[];
  max_gps_accuracy_m: number;
}

export interface Correction {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  attendance_date: string;
  requested_check_in: string | null;
  requested_check_out: string | null;
  requested_status: string | null;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  is_direct: boolean;
  reviewer_name: string | null;
  decision_reason: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface LeaveType {
  id: number;
  code: string;
  name: string;
  is_paid: boolean;
  allows_half_day: boolean;
  balance_required: boolean;
  requires_attachment: boolean;
  annual_entitlement: number;
  carry_forward_max: number;
  is_active: boolean;
}

export interface LeaveBalance {
  leave_type_id: number;
  code: string;
  name: string;
  year: number;
  is_paid: boolean;
  tracked: boolean;
  allocated: number;
  adjusted: number;
  used: number;
  pending: number;
  balance: number;
  available: number;
}

export type LeaveStatus =
  | 'PENDING_MANAGER' | 'PENDING_HR' | 'NEEDS_CHANGES' | 'APPROVED' | 'REJECTED'
  | 'CANCELLATION_REQUESTED' | 'CANCELLED';

export interface LeaveRequest {
  id: number;
  employee: { id: number; employee_code: string; full_name: string; department: string | null };
  leave_type: { id: number; code: string; name: string };
  start_date: string;
  end_date: string;
  is_half_day: boolean;
  half_day_session: string | null;
  days: number;
  reason: string;
  has_attachment: boolean;
  status: LeaveStatus;
  created_at: string;
  decided_at: string | null;
  can_decide: boolean;
  can_edit: boolean;
  can_cancel: boolean;
  history?: { id: number; step: string; action: string; comments: string | null; created_at: string; actor_name: string | null }[];
}

export interface Shift {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  grace_minutes: number;
  half_day_hours: number;
  full_day_hours: number;
  is_overnight: boolean;
  is_default: boolean;
  is_active: boolean;
}

export interface Office {
  id: number;
  name: string;
  radius_m: number;
  is_active: boolean;
  latitude?: number;
  longitude?: number;
}

export interface Holiday {
  id: number;
  date: string;
  name: string;
  holiday_type: string;
}

export interface Notification {
  id: number;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface ReportData {
  name: string;
  from: string;
  to: string;
  columns: { key: string; label: string }[];
  rows: Record<string, string | number | null>[];
}
