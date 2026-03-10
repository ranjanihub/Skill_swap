/*
  Session request–approval workflow

  - Extends skill_swap_sessions status to include 'pending_approval' and 'rejected'
  - Allows sessions to exist in a request state before being confirmed
*/

-- Drop the existing check constraint and replace with one that includes new statuses
ALTER TABLE skill_swap_sessions
  DROP CONSTRAINT IF EXISTS skill_swap_sessions_status_check;

ALTER TABLE skill_swap_sessions
  ADD CONSTRAINT skill_swap_sessions_status_check
  CHECK (status IN ('pending_approval', 'scheduled', 'ongoing', 'completed', 'cancelled', 'rejected'));
