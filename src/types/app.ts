export type ShiftType = 'long' | 'short' | 'international';
export type ShiftCategory = 'long' | 'short' | 'international';

export interface Shift {
  id: string;
  name: string;
  shift_type: ShiftType;
  shift_category?: ShiftCategory | null;
  assigned_teams?: number[] | null;
  travel_start_date?: string | null;
  hotel_start_date?: string | null;
  start_date: string;
  end_date: string;
  is_active: boolean;
  team_offset: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
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

export interface IronTransaction {
  id: string;
  child_id: string;
  supervisor_user_id: string | null;
  performed_by: string | null;
  amount_change: number;
  balance_after: number | null;
  reason: string | null;
  created_at: string;
}

export interface Schedule {
  id: string;
  shift_id: string | null;
  date: string;
  raw_text: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScheduleSubSlot {
  time: string;
  teams: number[];
}

export interface ScheduleItem {
  id: string;
  schedule_id: string;
  time_start: string | null;
  time_end: string | null;
  title: string;
  description: string | null;
  target_teams: number[];
  order_index: number;
  category?: string | null;
  has_sub_slots?: boolean | null;
  sub_slots?: ScheduleSubSlot[] | null;
}

export type TalentStatus = 'draft' | 'collecting' | 'generated' | 'finished';

export interface TalentEvent {
  id: string;
  shift_id: string | null;
  title: string;
  status: TalentStatus;
  created_at: string;
  updated_at: string;
}

export interface TalentEntry {
  id: string;
  event_id: string;
  team_number: number;
  title: string;
  description: string | null;
  break_needed_after: number;
  order_index: number;
  created_by: string | null;
  created_at: string;
}

export interface Broadcast {
  id: string;
  message: string;
  color: string;
  target_teams: number[];
  sent_by: string | null;
  expires_at: string | null;
  created_at: string;
}
