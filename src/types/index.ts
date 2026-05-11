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
}

export interface Item {
  id: string;
  session_id: string;
  name: string;
  price: number;
  quantity: number;
  created_at: string;
}

export interface ItemAssignment {
  id: string;
  item_id: string;
  participant_id: string;
  split_type: 'equal' | 'percentage';
  percentage: number | null;
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
  split_type: 'equal' | 'percentage';
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
}

export interface UpdateAssignmentsRequest {
  assignments: Array<{
    participant_id: string;
    split_type: 'equal' | 'percentage';
    percentage?: number;
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
