-- Enable Row Level Security for all tenant-isolated tables
-- This ensures complete data isolation between organizations

-- Organizations table - no RLS needed as it's the root tenant table
-- Users can only access their own organization through application logic

-- Enable RLS on User table
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see users in their organization
CREATE POLICY user_organization_isolation ON "users"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true)::text);

-- Enable RLS on Employee table
ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY;

-- Policy: Employees can only see employees in their organization
CREATE POLICY employee_organization_isolation ON "employees"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true)::text);

-- Enable RLS on Department table
ALTER TABLE "departments" ENABLE ROW LEVEL SECURITY;

-- Policy: Departments can only see departments in their organization
CREATE POLICY department_organization_isolation ON "departments"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true)::text);

-- Enable RLS on AttendanceRecord table
ALTER TABLE "attendance_records" ENABLE ROW LEVEL SECURITY;

-- Policy: Attendance records can only see records in their organization
CREATE POLICY attendance_organization_isolation ON "attendance_records"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true)::text);

-- Enable RLS on Shift table
ALTER TABLE "shifts" ENABLE ROW LEVEL SECURITY;

-- Policy: Shifts can only see shifts in their organization
CREATE POLICY shift_organization_isolation ON "shifts"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true)::text);

-- Enable RLS on ShiftAssignment table
ALTER TABLE "shift_assignments" ENABLE ROW LEVEL SECURITY;

-- Policy: Shift assignments are isolated by employee's organization
CREATE POLICY shift_assignment_organization_isolation ON "shift_assignments"
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM "employees" e 
    WHERE e.id = employee_id 
    AND e.organization_id = current_setting('app.current_organization_id', true)::text
  ));

-- Enable RLS on LeaveRequest table
ALTER TABLE "leave_requests" ENABLE ROW LEVEL SECURITY;

-- Policy: Leave requests can only see requests in their organization
CREATE POLICY leave_request_organization_isolation ON "leave_requests"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true)::text);

-- Enable RLS on PayrollRecord table
ALTER TABLE "payroll_records" ENABLE ROW LEVEL SECURITY;

-- Policy: Payroll records can only see records in their organization
CREATE POLICY payroll_record_organization_isolation ON "payroll_records"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true)::text);

-- Enable RLS on Notification table
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;

-- Policy: Notifications can only see notifications in their organization
CREATE POLICY notification_organization_isolation ON "notifications"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true)::text);

-- Enable RLS on AuditLog table
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

-- Policy: Audit logs can only see logs in their organization
CREATE POLICY audit_log_organization_isolation ON "audit_logs"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true)::text);

-- Enable RLS on AiConversation table
ALTER TABLE "ai_conversations" ENABLE ROW LEVEL SECURITY;

-- Policy: AI conversations can only see conversations in their organization
CREATE POLICY ai_conversation_organization_isolation ON "ai_conversations"
  FOR ALL
  USING (organization_id = current_setting('app.current_organization_id', true)::text);

-- Function to set organization context for the session
-- This should be called at the beginning of each request with the user's organization ID
CREATE OR REPLACE FUNCTION set_organization_context(org_id TEXT)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_organization_id', org_id, true);
END;
$$ LANGUAGE plpgsql;

-- Function to get current organization context
CREATE OR REPLACE FUNCTION get_organization_context()
RETURNS TEXT AS $$
BEGIN
  RETURN current_setting('app.current_organization_id', true);
END;
$$ LANGUAGE plpgsql;

-- Function to clear organization context (for cleanup)
CREATE OR REPLACE FUNCTION clear_organization_context()
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_organization_id', '', true);
END;
$$ LANGUAGE plpgsql;