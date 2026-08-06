export type ShiftType = 'long' | 'short' | 'international';

export interface Shift {
  id: string;
  name: string;
  shift_type: ShiftType;
  start_date: string;
  end_date: string;
  is_active: boolean;
  team_offset: number;
  created_at: string;
  updated_at: string;
}

export interface Child {
  id: string;
  shift_id: string | null;
  row_number: number | null;
  team_number: number;
  full_name: string;
  phone: string | null;
  team_name: string | null;
  note_from_table: string | null;
  is_present: boolean;
  has_logged_in: boolean;
  iron_dollars: number;
  telegram_username: string | null;
  supervisor_notes: string | null;
  raw_data: any;
  created_at: string;
  updated_at: string;
}

export interface Transfer {
  id: string;
  child_id: string;
  child_full_name: string;
  from_team: number;
  to_team: number;
  performed_by: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  metadata: any;
  created_at: string;
}

export interface UploadedFile {
  id: string;
  filename: string;
  shift_id: string | null;
  rows_count: number;
  created_at: string;
}
