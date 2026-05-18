// Database Types
export interface Session {
  id: string;
  created_at: string;
  expires_at: string;
  subtotal: number;
  tax_amount: number;
  service_amount: number;
  grand_total: number;
  tax_percentage: number;
  service_percentage: number;
  receipt_image_url: string | null;
  status: 'active' | 'completed' | 'expired';
}

export interface Participant {
  id: string;
  session_id: string;
  name: string;
  created_at: string;
  is_paid: boolean;
  paid_at: string | null;
}

export type BankCode = 'BCA' | 'Jago' | 'GoPay' | 'Other';

export interface SessionBankAccount {
  id: string;
  session_id: string;
  bank_name: string;
  bank_account_number: string;
  bank_account_holder: string;
  display_order: number;
  created_at: string;
}

// Convenience shape used by forms and the read-only card.
export interface BankInfoInput {
  bank_name: string;
  bank_account_number: string;
  bank_account_holder: string;
}

export interface Item {
  id: string;
  session_id: string;
  name: string;
  price: number;
  quantity: number;
  created_at: string;
}

export type SplitType = 'equal' | 'percentage' | 'unit';

export interface ItemAssignment {
  id: string;
  item_id: string;
  session_id: string;
  participant_id: string;
  split_type: SplitType;
  percentage: number | null;
  unit_count: number | null;
  created_at: string;
}

// Computed Types
export interface ItemWithAssignments extends Item {
  assignments: ItemAssignment[];
}

export interface SessionFull {
  session: Session;
  participants: Participant[];
  items: ItemWithAssignments[];
  // v1: 0 or 1 bank account per session. Future multi-bank flip is a type change to `SessionBankAccount[]`.
  bank_account: SessionBankAccount | null;
}

// Bill Calculation Types
export interface ParticipantBill {
  participant: Participant;
  items: ParticipantItem[];
  subtotal: number;
  tax_share: number;
  service_share: number;
  total: number;
}

export interface ParticipantItem {
  item: Item;
  share_amount: number;
  share_percentage: number;
  split_type: SplitType;
  unit_count: number | null;
  shared_with: string[];
}

// API Request/Response Types
export interface CreateSessionRequest {
  subtotal?: number;
  tax_amount?: number;
  service_amount?: number;
  grand_total?: number;
  tax_percentage?: number;
  service_percentage?: number;
  receipt_image_url?: string;
  bank_account?: BankInfoInput | null;
}

export interface UpdateAssignmentsRequest {
  assignments: Array<{
    participant_id: string;
    split_type: SplitType;
    percentage?: number;
    unit_count?: number;
  }>;
}

// API Error Types
export interface APIError {
  error: string;
  code: string;
  details?: unknown;
}

export type APIErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'SESSION_EXPIRED'
  | 'INVALID_INPUT'
  | 'PARTICIPANT_EXISTS'
  | 'INVALID_PERCENTAGE';
