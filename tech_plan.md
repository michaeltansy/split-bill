# Split Bill - Technical Implementation Plan

## Table of Contents
1. [Technology Stack Details](#technology-stack-details)
2. [Environment Configuration](#environment-configuration)
3. [Database Design](#database-design)
4. [API Specifications](#api-specifications)
5. [Type Definitions](#type-definitions)
6. [Component Specifications](#component-specifications)
7. [Frontend Specifications](#frontend-specifications)
8. [OCR Integration](#ocr-integration)
9. [Calculation Logic](#calculation-logic)
10. [Real-time Subscriptions](#real-time-subscriptions)
11. [Docker Configuration](#docker-configuration)
12. [Session Cleanup Strategy](#session-cleanup-strategy)
13. [Error Handling](#error-handling)
14. [Implementation Checklist](#implementation-checklist)

---

## 1. Technology Stack Details

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| Framework | Next.js | 14.x | Full-stack React framework with App Router |
| Language | TypeScript | 5.x | Type-safe JavaScript |
| Database | Supabase | Latest | PostgreSQL with real-time subscriptions |
| OCR | @aspect-guten/ocr | Latest | Receipt text extraction |
| Styling | Tailwind CSS | 3.x | Utility-first CSS |
| State | React hooks | - | Local state management |
| Container | Docker | Latest | Containerization |

---

## 2. Environment Configuration

### `.env.example`
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# OCR (if external API needed)
OCR_MODEL_PATH=/models/ocr
```

### Environment Setup Steps
1. Create Supabase project at https://supabase.com
2. Copy project URL and anon key
3. Enable Realtime for required tables
4. Run database migrations

---

## 3. Database Design

### 3.1 Complete Schema with Indexes

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sessions table
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 week'),
  subtotal DECIMAL(10,2) DEFAULT 0,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  service_amount DECIMAL(10,2) DEFAULT 0,
  grand_total DECIMAL(10,2) DEFAULT 0,
  tax_percentage DECIMAL(5,2) DEFAULT 0,
  service_percentage DECIMAL(5,2) DEFAULT 0,
  receipt_image_url TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired'))
);

CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_sessions_status ON sessions(status);

-- Participants table
CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, name)
);

CREATE INDEX idx_participants_session_id ON participants(session_id);

-- Items table
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  quantity INTEGER DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_items_session_id ON items(session_id);

-- Item assignments table
CREATE TABLE item_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  split_type VARCHAR(20) DEFAULT 'equal' CHECK (split_type IN ('equal', 'percentage')),
  percentage DECIMAL(5,2) CHECK (percentage IS NULL OR (percentage > 0 AND percentage <= 100)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(item_id, participant_id)
);

CREATE INDEX idx_assignments_item_id ON item_assignments(item_id);
CREATE INDEX idx_assignments_participant_id ON item_assignments(participant_id);

-- Enable Row Level Security
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_assignments ENABLE ROW LEVEL SECURITY;

-- Public access policies (sessions are public via UUID)
CREATE POLICY "Sessions are publicly accessible" ON sessions FOR ALL USING (true);
CREATE POLICY "Participants are publicly accessible" ON participants FOR ALL USING (true);
CREATE POLICY "Items are publicly accessible" ON items FOR ALL USING (true);
CREATE POLICY "Assignments are publicly accessible" ON item_assignments FOR ALL USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE participants;
ALTER PUBLICATION supabase_realtime ADD TABLE items;
ALTER PUBLICATION supabase_realtime ADD TABLE item_assignments;
```

### 3.2 Database Functions

```sql
-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM sessions WHERE expires_at < NOW() AND status != 'expired';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get session with all related data
CREATE OR REPLACE FUNCTION get_session_full(session_uuid UUID)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_build_object(
      'session', row_to_json(s),
      'participants', COALESCE((
        SELECT json_agg(row_to_json(p))
        FROM participants p WHERE p.session_id = session_uuid
      ), '[]'::json),
      'items', COALESCE((
        SELECT json_agg(
          json_build_object(
            'id', i.id,
            'name', i.name,
            'price', i.price,
            'quantity', i.quantity,
            'assignments', COALESCE((
              SELECT json_agg(row_to_json(a))
              FROM item_assignments a WHERE a.item_id = i.id
            ), '[]'::json)
          )
        )
        FROM items i WHERE i.session_id = session_uuid
      ), '[]'::json)
    )
    FROM sessions s WHERE s.id = session_uuid
  );
END;
$$ LANGUAGE plpgsql;
```

---

## 4. API Specifications

### 4.1 Sessions API

#### `POST /api/sessions`
Create a new session.

**Request Body:**
```typescript
{
  subtotal?: number;
  tax_amount?: number;
  service_amount?: number;
  grand_total?: number;
  tax_percentage?: number;
  service_percentage?: number;
  receipt_image_url?: string;
}
```

**Response:** `201 Created`
```typescript
{
  id: string;
  created_at: string;
  expires_at: string;
  // ... all session fields
}
```

#### `GET /api/sessions/[id]`
Get session with all related data.

**Response:** `200 OK`
```typescript
{
  session: Session;
  participants: Participant[];
  items: ItemWithAssignments[];
}
```

#### `PATCH /api/sessions/[id]`
Update session details.

**Request Body:** Partial session fields

**Response:** `200 OK` with updated session

---

### 4.2 Participants API

#### `POST /api/sessions/[id]/participants`
Add participant to session.

**Request Body:**
```typescript
{ name: string }
```

**Response:** `201 Created`
```typescript
{ id: string; session_id: string; name: string; created_at: string }
```

#### `DELETE /api/sessions/[id]/participants/[participantId]`
Remove participant from session.

**Response:** `204 No Content`

---

### 4.3 Items API

#### `POST /api/sessions/[id]/items`
Add item to session.

**Request Body:**
```typescript
{ name: string; price: number; quantity?: number }
```

#### `PATCH /api/sessions/[id]/items/[itemId]`
Update item.

#### `DELETE /api/sessions/[id]/items/[itemId]`
Delete item.

#### `POST /api/sessions/[id]/items/bulk`
Bulk create items (from OCR).

**Request Body:**
```typescript
{
  items: Array<{ name: string; price: number; quantity?: number }>
}
```

---

### 4.4 Assignments API

#### `POST /api/assignments`
Create or update item assignment.

**Request Body:**
```typescript
{
  item_id: string;
  participant_id: string;
  split_type: 'equal' | 'percentage';
  percentage?: number;
}
```

#### `DELETE /api/assignments/[id]`
Remove assignment.

#### `PUT /api/items/[itemId]/assignments`
Set all assignments for an item (replaces existing).

**Request Body:**
```typescript
{
  assignments: Array<{
    participant_id: string;
    split_type: 'equal' | 'percentage';
    percentage?: number;
  }>
}
```

---

### 4.5 OCR API

#### `POST /api/ocr`
Process receipt image.

**Request Body:** `FormData` with `image` file

**Response:** `200 OK`
```typescript
{
  items: Array<{ name: string; price: number; quantity: number }>;
  subtotal: number | null;
  tax_amount: number | null;
  service_amount: number | null;
  grand_total: number | null;
  tax_percentage: number | null;
  service_percentage: number | null;
  raw_text: string;
  confidence: number;
}
```

---

## 5. Type Definitions

### `src/types/index.ts`

```typescript
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

// OCR Types
export interface OCRResult {
  items: OCRItem[];
  subtotal: number | null;
  tax_amount: number | null;
  service_amount: number | null;
  grand_total: number | null;
  tax_percentage: number | null;
  service_percentage: number | null;
  raw_text: string;
  confidence: number;
}

export interface OCRItem {
  name: string;
  price: number;
  quantity: number;
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
  shared_with: string[]; // participant names
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
```

---

## 6. Component Specifications

### 6.1 ImageUploader

**Props:**
```typescript
interface ImageUploaderProps {
  onUpload: (file: File) => void;
  onProcessed: (result: OCRResult) => void;
  isProcessing: boolean;
}
```

**Features:**
- Drag and drop zone
- File picker button
- Image preview
- Processing indicator
- Supported formats: JPG, PNG, WEBP
- Max file size: 10MB

---

### 6.2 ItemList

**Props:**
```typescript
interface ItemListProps {
  items: ItemWithAssignments[];
  participants: Participant[];
  onItemUpdate: (id: string, data: Partial<Item>) => void;
  onItemDelete: (id: string) => void;
  onAssignmentChange: (itemId: string, assignments: UpdateAssignmentsRequest) => void;
  editable: boolean;
}
```

**Features:**
- Editable item name and price
- Delete item button
- Show assignment status per item
- Expand to show/edit assignments

---

### 6.3 ParticipantManager

**Props:**
```typescript
interface ParticipantManagerProps {
  participants: Participant[];
  onAdd: (name: string) => void;
  onRemove: (id: string) => void;
  editable: boolean;
}
```

**Features:**
- Add participant input
- List of participants with remove button
- Duplicate name prevention

---

### 6.4 ItemAssignment

**Props:**
```typescript
interface ItemAssignmentProps {
  item: ItemWithAssignments;
  participants: Participant[];
  onAssignmentChange: (assignments: UpdateAssignmentsRequest) => void;
}
```

**Features:**
- Checkbox per participant
- Toggle between equal/percentage split
- Percentage input fields (when percentage mode)
- Validation: percentages must sum to 100%

---

### 6.5 TaxServiceInput

**Props:**
```typescript
interface TaxServiceInputProps {
  subtotal: number;
  taxAmount: number;
  serviceAmount: number;
  grandTotal: number;
  taxPercentage: number;
  servicePercentage: number;
  onUpdate: (field: string, value: number) => void;
  editable: boolean;
}
```

**Features:**
- Display extracted amounts
- Show calculated percentages
- Allow manual override
- Auto-recalculate when amounts change
- Validation indicator (sum matches grand total)

---

### 6.6 BillSummary

**Props:**
```typescript
interface BillSummaryProps {
  bills: ParticipantBill[];
  taxPercentage: number;
  servicePercentage: number;
}
```

**Features:**
- Collapsible section per participant
- Item list with share amounts
- Subtotal, tax, service, total breakdown
- Copy individual bill to clipboard
- Grand total verification

---

## 7. Frontend Specifications

### 7.1 Page Layouts

#### 7.1.1 Home Page (`/`)

**Purpose:** Create a new bill-splitting session by uploading a receipt.

**Layout Structure:**
```
┌─────────────────────────────────────────────────────────┐
│  Header: "Split Bill"                          [?] Help │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │                                                 │   │
│  │         📷 Upload Receipt Image                │   │
│  │                                                 │   │
│  │    Drag & drop or click to select              │   │
│  │    Supports: JPG, PNG, WEBP (max 10MB)         │   │
│  │                                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ────────────── OR ──────────────                      │
│                                                         │
│  [ Start Without Image ]                                │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  Footer: "Sessions expire after 1 week"                 │
└─────────────────────────────────────────────────────────┘
```

**Components Used:**
- `ImageUploader`
- `Header` (simple branding)

**States:**
- Default: Show upload zone
- Uploading: Progress indicator
- Processing OCR: Loading spinner with "Scanning receipt..."
- Error: Error message with retry option

---

#### 7.1.2 Session Page - Owner View (`/session/[id]`)

**Purpose:** Session owner manages items, participants, and assignments.

**Layout Structure:**
```
┌─────────────────────────────────────────────────────────┐
│  Header: "Split Bill"                    [Share] [Copy] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─ Receipt Preview (collapsible) ──────────────────┐  │
│  │  [Thumbnail]  Uploaded: 2 mins ago               │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─ Receipt Summary ────────────────────────────────┐  │
│  │  Subtotal:     $85.00                    [Edit]  │  │
│  │  Tax (10%):    $8.50                     [Edit]  │  │
│  │  Service (5%): $4.25                     [Edit]  │  │
│  │  ─────────────────────────────────────────────── │  │
│  │  Grand Total:  $97.75                    ✓ Valid │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─ Participants ───────────────────────────────────┐  │
│  │  [+ Add Participant]                             │  │
│  │  • Alice  [×]                                    │  │
│  │  • Bob    [×]                                    │  │
│  │  • Carol  [×]                                    │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─ Items ──────────────────────────────────────────┐  │
│  │  [+ Add Item]                                    │  │
│  │                                                   │  │
│  │  ┌─ Burger ─────────────────── $15.00 ────────┐ │  │
│  │  │  ☑ Alice  ☑ Bob  ☐ Carol                   │ │  │
│  │  │  Split: [Equal ▼]                    [🗑️]  │ │  │
│  │  └────────────────────────────────────────────┘ │  │
│  │                                                   │  │
│  │  ┌─ Pizza ──────────────────── $25.00 ────────┐ │  │
│  │  │  ☑ Alice  ☐ Bob  ☑ Carol                   │ │  │
│  │  │  Split: [Percentage ▼]                     │ │  │
│  │  │    Alice: [60%]  Carol: [40%]        [🗑️]  │ │  │
│  │  └────────────────────────────────────────────┘ │  │
│  │                                                   │  │
│  │  ... more items ...                              │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─ Bill Summary ───────────────────────────────────┐  │
│  │                                                   │  │
│  │  ▼ Alice                              Total: $42.50│ │
│  │    • Burger (50%)                         $7.50  │  │
│  │    • Pizza (60%)                         $15.00  │  │
│  │    • Salad                               $12.00  │  │
│  │    ──────────────────────────────────────────    │  │
│  │    Subtotal:                             $34.50  │  │
│  │    Tax share:                             $4.05  │  │
│  │    Service share:                         $3.95  │  │
│  │    ══════════════════════════════════════════    │  │
│  │    TOTAL:                                $42.50  │  │
│  │                                      [📋 Copy]   │  │
│  │                                                   │  │
│  │  ▶ Bob                                Total: $28.25│ │
│  │  ▶ Carol                              Total: $27.00│ │
│  │                                                   │  │
│  │  ═══════════════════════════════════════════════ │  │
│  │  Grand Total:                            $97.75  │  │
│  │  Unassigned:                              $0.00  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Components Used:**
- `ReceiptSummary`
- `TaxServiceInput`
- `ParticipantManager`
- `ItemList`
- `ItemAssignment` (within each item)
- `BillSummary`

---

#### 7.1.3 Session Page - Participant View (`/session/[id]?participant=[name]`)

**Purpose:** Participant marks their own items (simplified view).

**Layout Structure:**
```
┌─────────────────────────────────────────────────────────┐
│  Header: "Split Bill - Alice's View"                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─ Your Items ─────────────────────────────────────┐  │
│  │  Tap items you ordered:                          │  │
│  │                                                   │  │
│  │  [✓] Burger ............................ $15.00  │  │
│  │  [✓] Pizza ............................. $25.00  │  │
│  │  [ ] Salad ............................. $12.00  │  │
│  │  [ ] Drinks ............................ $18.00  │  │
│  │  [✓] Dessert ........................... $15.00  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─ Shared Items ───────────────────────────────────┐  │
│  │  Items shared with others:                       │  │
│  │                                                   │  │
│  │  Burger - shared with Bob                        │  │
│  │    Your share: 50% ($7.50)                       │  │
│  │                                                   │  │
│  │  Pizza - shared with Carol                       │  │
│  │    [Your %: [60] ]  Carol: 40%                   │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─ Your Bill ──────────────────────────────────────┐  │
│  │  Items:                                  $42.50  │  │
│  │  Tax (10%):                               $4.25  │  │
│  │  Service (5%):                            $2.13  │  │
│  │  ═══════════════════════════════════════════════ │  │
│  │  YOUR TOTAL:                             $48.88  │  │
│  │                                                   │  │
│  │  [📋 Copy My Bill]                               │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Components Used:**
- `ItemList` (simplified, checkbox only)
- `BillSummary` (single participant)

---

### 7.2 User Journey Flows

#### 7.2.1 Session Creator Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Home Page  │────▶│  Upload &    │────▶│   Review     │
│              │     │  OCR Scan    │     │   Items      │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
                                                 ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Share     │◀────│     Add      │◀────│  Edit Tax/   │
│    Link      │     │ Participants │     │   Service    │
└──────────────┘     └──────────────┘     └──────────────┘
       │
       ▼
┌──────────────┐     ┌──────────────┐
│  Wait for    │────▶│    View      │
│  Responses   │     │   Summary    │
└──────────────┘     └──────────────┘
```

**Steps:**
1. **Home Page** → Upload receipt image (or skip)
2. **OCR Processing** → System extracts items, tax, service
3. **Review Items** → Edit/add/remove items as needed
4. **Edit Tax/Service** → Verify or adjust extracted values
5. **Add Participants** → Enter names of people splitting
6. **Share Link** → Copy and send session URL to participants
7. **Wait for Responses** → Real-time updates as people claim items
8. **View Summary** → See final breakdown for each person

---

#### 7.2.2 Participant Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Receive Link │────▶│  Enter Name  │────▶│  View Items  │
│              │     │  (if new)    │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
                                                 ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Copy      │◀────│    View      │◀────│   Claim      │
│   My Bill    │     │   My Total   │     │   Items      │
└──────────────┘     └──────────────┘     └──────────────┘
```

**Steps:**
1. **Receive Link** → Get session URL from creator
2. **Enter Name** → Select existing name or add new (if allowed)
3. **View Items** → See all items from the receipt
4. **Claim Items** → Check items they ordered
5. **View My Total** → See their share with tax/service
6. **Copy My Bill** → Copy breakdown to clipboard

---

### 7.3 Custom Hooks Specifications

#### `useSession`
```typescript
// src/hooks/useSession.ts
interface UseSessionReturn {
  session: Session | null;
  participants: Participant[];
  items: ItemWithAssignments[];
  isLoading: boolean;
  error: Error | null;

  // Actions
  updateSession: (data: Partial<Session>) => Promise<void>;
  addParticipant: (name: string) => Promise<Participant>;
  removeParticipant: (id: string) => Promise<void>;
  addItem: (item: Omit<Item, 'id' | 'session_id' | 'created_at'>) => Promise<Item>;
  updateItem: (id: string, data: Partial<Item>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  updateAssignments: (itemId: string, assignments: UpdateAssignmentsRequest) => Promise<void>;
}

function useSession(sessionId: string): UseSessionReturn;
```

**Features:**
- Fetches session data on mount
- Sets up real-time subscriptions
- Provides CRUD actions with optimistic updates
- Handles errors and loading states

---

#### `useOCR`
```typescript
// src/hooks/useOCR.ts
interface UseOCRReturn {
  processImage: (file: File) => Promise<OCRResult>;
  isProcessing: boolean;
  result: OCRResult | null;
  error: Error | null;
  reset: () => void;
}

function useOCR(): UseOCRReturn;
```

**Features:**
- Handles image upload and OCR processing
- Manages processing state
- Provides result and error states

---

#### `useBillCalculation`
```typescript
// src/hooks/useBillCalculation.ts
interface UseBillCalculationReturn {
  bills: ParticipantBill[];
  totalAssigned: number;
  totalUnassigned: number;
  isValid: boolean;
}

function useBillCalculation(
  session: Session,
  items: ItemWithAssignments[],
  participants: Participant[]
): UseBillCalculationReturn;
```

**Features:**
- Recalculates on any input change
- Memoized for performance
- Validates totals match

---

#### `useClipboard`
```typescript
// src/hooks/useClipboard.ts
interface UseClipboardReturn {
  copy: (text: string) => Promise<boolean>;
  copied: boolean;
  error: Error | null;
}

function useClipboard(resetDelay?: number): UseClipboardReturn;
```

**Features:**
- Copy text to clipboard
- Shows "copied" state for feedback
- Auto-resets after delay (default 2s)

---

#### `useShareSession`
```typescript
// src/hooks/useShareSession.ts
interface UseShareSessionReturn {
  shareUrl: string;
  copyShareUrl: () => Promise<boolean>;
  copied: boolean;
  canShare: boolean; // Web Share API support
  share: () => Promise<void>; // Native share dialog
}

function useShareSession(sessionId: string): UseShareSessionReturn;
```

**Features:**
- Generates shareable URL
- Clipboard copy functionality
- Native Web Share API integration (mobile)

---

### 7.4 Responsive Design

#### Breakpoints
```typescript
// Tailwind CSS breakpoints
const breakpoints = {
  sm: '640px',   // Mobile landscape
  md: '768px',   // Tablet
  lg: '1024px',  // Desktop
  xl: '1280px',  // Large desktop
};
```

#### Mobile-First Approach

**Mobile (< 640px):**
- Single column layout
- Full-width components
- Bottom sheet for share options
- Larger touch targets (min 44px)
- Collapsible sections to save space

**Tablet (768px - 1023px):**
- Two-column layout for items + summary
- Side panel for participant list
- Modal for share dialog

**Desktop (≥ 1024px):**
- Three-column layout: Participants | Items | Summary
- Inline editing
- Hover states for actions

#### Layout Grid
```
Mobile:
┌─────────────────┐
│    Header       │
├─────────────────┤
│  Receipt Info   │
├─────────────────┤
│  Participants   │
├─────────────────┤
│     Items       │
├─────────────────┤
│    Summary      │
└─────────────────┘

Tablet:
┌─────────────────────────┐
│         Header          │
├─────────────────────────┤
│  Receipt  │ Participants│
├───────────┴─────────────┤
│         Items           │
├─────────────────────────┤
│        Summary          │
└─────────────────────────┘

Desktop:
┌───────────────────────────────────────┐
│               Header                  │
├──────────┬───────────────┬────────────┤
│Partici-  │               │            │
│pants     │    Items      │  Summary   │
│          │               │            │
│          │               │            │
│          │               │            │
└──────────┴───────────────┴────────────┘
```

---

### 7.5 UI States

#### 7.5.1 Loading States

**Page Loading:**
```typescript
// Skeleton component for session page
<div className="animate-pulse">
  <div className="h-8 bg-gray-200 rounded w-1/3 mb-4" />
  <div className="h-32 bg-gray-200 rounded mb-4" />
  <div className="h-24 bg-gray-200 rounded mb-4" />
  <div className="space-y-2">
    <div className="h-16 bg-gray-200 rounded" />
    <div className="h-16 bg-gray-200 rounded" />
    <div className="h-16 bg-gray-200 rounded" />
  </div>
</div>
```

**OCR Processing:**
```
┌─────────────────────────────────────┐
│                                     │
│         [Spinner Animation]         │
│                                     │
│       Scanning your receipt...      │
│                                     │
│    This may take a few seconds      │
│                                     │
└─────────────────────────────────────┘
```

**Button Loading:**
```typescript
<button disabled className="opacity-50 cursor-not-allowed">
  <Spinner className="w-4 h-4 mr-2" />
  Saving...
</button>
```

---

#### 7.5.2 Error States

**Full Page Error:**
```
┌─────────────────────────────────────┐
│                                     │
│              ⚠️                     │
│                                     │
│     Session not found               │
│                                     │
│   This session may have expired     │
│   or the link is incorrect.         │
│                                     │
│       [Go to Home Page]             │
│                                     │
└─────────────────────────────────────┘
```

**Inline Error (Toast):**
```typescript
interface Toast {
  id: string;
  type: 'error' | 'success' | 'warning' | 'info';
  message: string;
  duration?: number; // ms, default 5000
}

// Position: bottom-right on desktop, bottom-center on mobile
// Auto-dismiss after duration
// Manual dismiss with X button
```

**Field Error:**
```typescript
<input className="border-red-500" />
<p className="text-red-500 text-sm mt-1">
  Percentage must be between 1 and 100
</p>
```

**Error Messages:**
| Code | User-Friendly Message |
|------|----------------------|
| `SESSION_NOT_FOUND` | "Session not found. It may have expired." |
| `SESSION_EXPIRED` | "This session has expired. Sessions last 1 week." |
| `INVALID_INPUT` | "Please check your input and try again." |
| `OCR_FAILED` | "Couldn't read the receipt. Please try again or add items manually." |
| `PARTICIPANT_EXISTS` | "Someone with this name already exists." |
| `INVALID_PERCENTAGE` | "Percentages must add up to 100%." |
| `NETWORK_ERROR` | "Connection lost. Changes will sync when you're back online." |

---

#### 7.5.3 Empty States

**No Participants:**
```
┌─────────────────────────────────────┐
│                                     │
│            👥                       │
│                                     │
│     No participants yet             │
│                                     │
│   Add people to split the bill      │
│                                     │
│      [+ Add Participant]            │
│                                     │
└─────────────────────────────────────┘
```

**No Items:**
```
┌─────────────────────────────────────┐
│                                     │
│            📝                       │
│                                     │
│      No items on the bill           │
│                                     │
│   Upload a receipt or add items     │
│         manually                    │
│                                     │
│   [📷 Upload]    [+ Add Item]       │
│                                     │
└─────────────────────────────────────┘
```

**No Assignments:**
```
┌─────────────────────────────────────┐
│                                     │
│            🤷                       │
│                                     │
│     No items claimed yet            │
│                                     │
│   Share the link with participants  │
│   so they can claim their items     │
│                                     │
│          [Share Link]               │
│                                     │
└─────────────────────────────────────┘
```

---

### 7.6 Share Functionality UI

#### Share Modal/Bottom Sheet

**Desktop (Modal):**
```
┌─────────────────────────────────────────────┐
│  Share this session                    [×]  │
├─────────────────────────────────────────────┤
│                                             │
│  Send this link to people splitting         │
│  the bill with you:                         │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │ https://splitbill.app/session/abc123  │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  [📋 Copy Link]              [✓ Copied!]    │
│                                             │
│  ─────────────── or ───────────────         │
│                                             │
│  Share via:                                 │
│  [WhatsApp] [Telegram] [Email] [SMS]        │
│                                             │
└─────────────────────────────────────────────┘
```

**Mobile (Bottom Sheet):**
```
┌─────────────────────────────────────────────┐
│  ═══════════════════════════════════════    │ (drag handle)
│                                             │
│  Share this session                         │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │ https://splitbill.app/s/abc123        │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  📋  Copy Link                      │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  📤  Share via Apps...              │    │  (native share)
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  📱  QR Code                        │    │
│  └─────────────────────────────────────┘    │
│                                             │
└─────────────────────────────────────────────┘
```

#### QR Code View
```
┌─────────────────────────────────────────────┐
│  Scan to join                          [×]  │
├─────────────────────────────────────────────┤
│                                             │
│         ┌───────────────────┐               │
│         │                   │               │
│         │    [QR CODE]      │               │
│         │                   │               │
│         │                   │               │
│         └───────────────────┘               │
│                                             │
│     Point your camera at this code          │
│                                             │
│            [📋 Copy Link Instead]           │
│                                             │
└─────────────────────────────────────────────┘
```

#### Copy Feedback
```typescript
// Button states
Default:   [📋 Copy Link]
Copying:   [⏳ Copying...]
Success:   [✓ Copied!]     // Green, resets after 2s
Error:     [⚠️ Failed]     // Red, shows toast with details
```

---

### 7.7 Form Validation

#### Validation Rules

**Participant Name:**
```typescript
const participantNameSchema = {
  required: "Name is required",
  minLength: { value: 1, message: "Name cannot be empty" },
  maxLength: { value: 100, message: "Name must be under 100 characters" },
  validate: {
    unique: (value, context) =>
      !context.participants.some(p => p.name.toLowerCase() === value.toLowerCase())
      || "This name already exists"
  }
};
```

**Item:**
```typescript
const itemSchema = {
  name: {
    required: "Item name is required",
    maxLength: { value: 255, message: "Name must be under 255 characters" }
  },
  price: {
    required: "Price is required",
    min: { value: 0, message: "Price cannot be negative" },
    validate: {
      isNumber: (value) => !isNaN(parseFloat(value)) || "Must be a valid number"
    }
  },
  quantity: {
    min: { value: 1, message: "Quantity must be at least 1" },
    validate: {
      isInteger: (value) => Number.isInteger(Number(value)) || "Must be a whole number"
    }
  }
};
```

**Percentage Split:**
```typescript
const percentageSplitSchema = {
  validate: {
    sumTo100: (assignments) => {
      const total = assignments.reduce((sum, a) => sum + (a.percentage || 0), 0);
      return Math.abs(total - 100) < 0.01 || "Percentages must add up to 100%";
    },
    allPositive: (assignments) => {
      return assignments.every(a => a.percentage > 0) || "All percentages must be greater than 0";
    }
  }
};
```

**Tax/Service:**
```typescript
const taxServiceSchema = {
  percentage: {
    min: { value: 0, message: "Cannot be negative" },
    max: { value: 100, message: "Cannot exceed 100%" }
  },
  amount: {
    min: { value: 0, message: "Cannot be negative" }
  }
};
```

#### Real-time Validation
- Validate on blur (when field loses focus)
- Validate on submit
- Show errors inline below fields
- Disable submit button when form is invalid
- Clear errors when user starts typing

---

### 7.8 Component Tree

```
App
├── Layout
│   ├── Header
│   │   ├── Logo
│   │   └── HelpButton
│   └── Footer
│
├── HomePage
│   ├── ImageUploader
│   │   ├── DropZone
│   │   ├── FileInput
│   │   ├── ImagePreview
│   │   └── ProcessingIndicator
│   └── StartWithoutImageButton
│
└── SessionPage
    ├── SessionHeader
    │   ├── SessionTitle
    │   └── ShareButton
    │       └── ShareModal
    │           ├── LinkCopyInput
    │           ├── SocialShareButtons
    │           └── QRCodeView
    │
    ├── ReceiptPreview (collapsible)
    │   └── Image
    │
    ├── ReceiptSummary
    │   └── TaxServiceInput
    │       ├── AmountInput (subtotal)
    │       ├── AmountInput (tax)
    │       ├── AmountInput (service)
    │       ├── AmountInput (grand total)
    │       └── ValidationIndicator
    │
    ├── ParticipantManager
    │   ├── AddParticipantForm
    │   └── ParticipantList
    │       └── ParticipantItem
    │           ├── Name
    │           └── RemoveButton
    │
    ├── ItemList
    │   ├── AddItemForm
    │   └── ItemCard[]
    │       ├── ItemHeader
    │       │   ├── ItemName (editable)
    │       │   ├── ItemPrice (editable)
    │       │   └── DeleteButton
    │       └── ItemAssignment
    │           ├── ParticipantCheckbox[]
    │           ├── SplitTypeToggle
    │           └── PercentageInputs (conditional)
    │
    └── BillSummary
        ├── SummaryHeader
        │   ├── GrandTotal
        │   └── UnassignedWarning
        └── ParticipantBillCard[]
            ├── ParticipantHeader
            │   ├── Name
            │   ├── Total
            │   └── ExpandToggle
            ├── ItemBreakdown
            │   └── BillLineItem[]
            ├── TaxServiceBreakdown
            └── CopyBillButton
```

---

## 8. OCR Integration

### 7.1 OCR Service (`src/lib/ocr.ts`)

```typescript
import Ocr from '@aspect-guten/ocr';

export async function processReceiptImage(imageBuffer: Buffer): Promise<OCRResult> {
  const ocr = new Ocr();
  await ocr.init();

  const result = await ocr.recognize(imageBuffer);
  const text = result.text;

  return parseReceiptText(text);
}
```

### 7.2 Receipt Parser (`src/lib/receiptParser.ts`)

**Parsing Strategy:**

1. **Line-by-line analysis**
2. **Item detection**: Lines with price pattern (e.g., `Item Name    $12.99`)
3. **Summary detection**: Keywords for subtotal, tax, service, total
4. **Price extraction**: Regex for currency amounts

**Regex Patterns:**
```typescript
const PATTERNS = {
  // Price at end of line: "Item Name    12.99" or "Item Name    $12.99"
  itemLine: /^(.+?)\s+\$?(\d+[.,]\d{2})\s*$/,

  // Quantity prefix: "2x Item Name    25.98" or "2 x Item Name"
  quantityPrefix: /^(\d+)\s*[xX]\s*(.+?)\s+\$?(\d+[.,]\d{2})\s*$/,

  // Subtotal keywords
  subtotal: /^(subtotal|sub-total|sub total)\s*:?\s*\$?(\d+[.,]\d{2})/i,

  // Tax keywords
  tax: /^(tax|vat|ppn|gst|hst)\s*:?\s*\$?(\d+[.,]\d{2})/i,

  // Service keywords
  service: /^(service|service charge|sc|gratuity|tip)\s*:?\s*\$?(\d+[.,]\d{2})/i,

  // Total keywords
  total: /^(total|grand total|amount due|balance)\s*:?\s*\$?(\d+[.,]\d{2})/i,
};
```

### 7.3 Back-Calculation Logic

```typescript
export function calculatePercentages(
  subtotal: number,
  taxAmount: number,
  serviceAmount: number
): { taxPercentage: number; servicePercentage: number } {
  if (subtotal <= 0) {
    return { taxPercentage: 0, servicePercentage: 0 };
  }

  return {
    taxPercentage: Math.round((taxAmount / subtotal) * 100 * 100) / 100,
    servicePercentage: Math.round((serviceAmount / subtotal) * 100 * 100) / 100,
  };
}
```

---

## 8. Calculation Logic

### `src/lib/calculations.ts`

```typescript
export function calculateParticipantBills(
  session: Session,
  items: ItemWithAssignments[],
  participants: Participant[]
): ParticipantBill[] {
  const bills: ParticipantBill[] = participants.map(p => ({
    participant: p,
    items: [],
    subtotal: 0,
    tax_share: 0,
    service_share: 0,
    total: 0,
  }));

  const participantMap = new Map(bills.map(b => [b.participant.id, b]));

  for (const item of items) {
    if (item.assignments.length === 0) continue;

    const totalItemPrice = item.price * item.quantity;
    const assignedParticipants = item.assignments;

    // Calculate share for each assigned participant
    for (const assignment of assignedParticipants) {
      const bill = participantMap.get(assignment.participant_id);
      if (!bill) continue;

      let shareAmount: number;
      let sharePercentage: number;

      if (assignment.split_type === 'percentage' && assignment.percentage !== null) {
        sharePercentage = assignment.percentage;
        shareAmount = (totalItemPrice * sharePercentage) / 100;
      } else {
        // Equal split
        sharePercentage = 100 / assignedParticipants.length;
        shareAmount = totalItemPrice / assignedParticipants.length;
      }

      // Get names of others sharing this item
      const sharedWith = assignedParticipants
        .filter(a => a.participant_id !== assignment.participant_id)
        .map(a => {
          const p = participants.find(p => p.id === a.participant_id);
          return p?.name || 'Unknown';
        });

      bill.items.push({
        item,
        share_amount: shareAmount,
        share_percentage: sharePercentage,
        split_type: assignment.split_type,
        shared_with: sharedWith,
      });

      bill.subtotal += shareAmount;
    }
  }

  // Calculate tax and service share proportionally
  const totalSubtotal = bills.reduce((sum, b) => sum + b.subtotal, 0);

  for (const bill of bills) {
    if (totalSubtotal > 0) {
      const proportion = bill.subtotal / totalSubtotal;
      bill.tax_share = session.tax_amount * proportion;
      bill.service_share = session.service_amount * proportion;
    }

    bill.total = bill.subtotal + bill.tax_share + bill.service_share;

    // Round to 2 decimal places
    bill.subtotal = Math.round(bill.subtotal * 100) / 100;
    bill.tax_share = Math.round(bill.tax_share * 100) / 100;
    bill.service_share = Math.round(bill.service_share * 100) / 100;
    bill.total = Math.round(bill.total * 100) / 100;
  }

  return bills;
}
```

---

## 9. Real-time Subscriptions

### Supabase Realtime Setup

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Subscribe to session changes
export function subscribeToSession(
  sessionId: string,
  callbacks: {
    onSessionChange: (session: Session) => void;
    onParticipantsChange: (participants: Participant[]) => void;
    onItemsChange: (items: Item[]) => void;
    onAssignmentsChange: (assignments: ItemAssignment[]) => void;
  }
) {
  const channel = supabase.channel(`session:${sessionId}`);

  channel
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
      (payload) => callbacks.onSessionChange(payload.new as Session)
    )
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'participants', filter: `session_id=eq.${sessionId}` },
      async () => {
        const { data } = await supabase.from('participants').select('*').eq('session_id', sessionId);
        callbacks.onParticipantsChange(data || []);
      }
    )
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'items', filter: `session_id=eq.${sessionId}` },
      async () => {
        const { data } = await supabase.from('items').select('*').eq('session_id', sessionId);
        callbacks.onItemsChange(data || []);
      }
    )
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'item_assignments' },
      async () => {
        // Refetch all assignments for items in this session
        const { data: items } = await supabase.from('items').select('id').eq('session_id', sessionId);
        if (items) {
          const itemIds = items.map(i => i.id);
          const { data: assignments } = await supabase
            .from('item_assignments')
            .select('*')
            .in('item_id', itemIds);
          callbacks.onAssignmentsChange(assignments || []);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
```

---

## 10. Docker Configuration

### `Dockerfile`
```dockerfile
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

### `docker-compose.yml`
```yaml
version: '3.8'

services:
  web:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL:-http://localhost:3000}
    restart: unless-stopped
```

### `next.config.js` (for standalone output)
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['@aspect-guten/ocr'],
  },
};

module.exports = nextConfig;
```

---

## 11. Session Cleanup Strategy

### Option A: Supabase Edge Function (Recommended)

```typescript
// supabase/functions/cleanup-sessions/index.ts
import { createClient } from '@supabase/supabase-js';

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data, error } = await supabase
    .from('sessions')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('id');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(
    JSON.stringify({ deleted: data?.length || 0 }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
```

**Cron Schedule (via Supabase Dashboard):**
- Run daily at midnight: `0 0 * * *`

### Option B: pg_cron Extension

```sql
-- Enable pg_cron (requires Supabase Pro)
SELECT cron.schedule(
  'cleanup-expired-sessions',
  '0 0 * * *',  -- Daily at midnight
  $$DELETE FROM sessions WHERE expires_at < NOW()$$
);
```

---

## 12. Error Handling

### API Error Response Format
```typescript
interface APIError {
  error: string;
  code: string;
  details?: unknown;
}
```

### Error Codes
| Code | Description |
|------|-------------|
| `SESSION_NOT_FOUND` | Session ID does not exist |
| `SESSION_EXPIRED` | Session has expired |
| `INVALID_INPUT` | Request validation failed |
| `OCR_FAILED` | OCR processing failed |
| `PARTICIPANT_EXISTS` | Duplicate participant name |
| `INVALID_PERCENTAGE` | Percentages don't sum to 100 |

### Client-Side Error Handling
```typescript
// src/lib/api.ts
export async function apiRequest<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new APIError(error.error, error.code, error.details);
  }

  return response.json();
}
```

---

## 14. Implementation Checklist

### Phase 1: Project Setup
- [ ] Initialize Next.js project with TypeScript
- [ ] Install dependencies (Supabase, Tailwind, OCR library)
- [ ] Create Supabase project and database
- [ ] Run database migrations
- [ ] Configure environment variables
- [ ] Set up Docker configuration
- [ ] Create type definitions

### Phase 2: Custom Hooks
- [ ] Implement `useSession` hook
- [ ] Implement `useOCR` hook
- [ ] Implement `useBillCalculation` hook
- [ ] Implement `useClipboard` hook
- [ ] Implement `useShareSession` hook

### Phase 3: Core Components
- [ ] Implement Supabase client
- [ ] Create ImageUploader component
  - [ ] DropZone with drag-and-drop
  - [ ] File picker button
  - [ ] Image preview
  - [ ] Processing indicator
- [ ] Integrate OCR library
- [ ] Implement receipt parser
- [ ] Create ItemList component
  - [ ] Editable item name/price
  - [ ] Delete item functionality
  - [ ] Assignment status indicators
- [ ] Create ParticipantManager component
  - [ ] Add participant form
  - [ ] Participant list with remove
  - [ ] Duplicate name validation
- [ ] Create TaxServiceInput component
  - [ ] Amount display/edit
  - [ ] Percentage calculation
  - [ ] Validation indicator
- [ ] Create ReceiptSummary component
- [ ] Create ItemAssignment component
  - [ ] Participant checkboxes
  - [ ] Split type toggle
  - [ ] Percentage inputs
- [ ] Create BillSummary component
  - [ ] Collapsible participant sections
  - [ ] Item breakdown list
  - [ ] Copy bill button

### Phase 4: API Routes
- [ ] POST /api/sessions
- [ ] GET /api/sessions/[id]
- [ ] PATCH /api/sessions/[id]
- [ ] POST /api/sessions/[id]/participants
- [ ] DELETE /api/sessions/[id]/participants/[participantId]
- [ ] POST /api/sessions/[id]/items
- [ ] PATCH /api/sessions/[id]/items/[itemId]
- [ ] DELETE /api/sessions/[id]/items/[itemId]
- [ ] POST /api/sessions/[id]/items/bulk
- [ ] PUT /api/items/[itemId]/assignments
- [ ] POST /api/ocr

### Phase 5: Page Implementation
- [ ] Home page
  - [ ] Image upload zone
  - [ ] "Start without image" option
  - [ ] OCR processing flow
  - [ ] Redirect to session page
- [ ] Session page (Owner view)
  - [ ] Three-column desktop layout
  - [ ] Receipt preview (collapsible)
  - [ ] All management components
  - [ ] Real-time subscriptions
- [ ] Session page (Participant view)
  - [ ] Simplified item selection
  - [ ] Personal bill display
  - [ ] Share percentage input for shared items

### Phase 6: Share Functionality
- [ ] ShareModal component
- [ ] ShareBottomSheet component (mobile)
- [ ] Link copy with feedback
- [ ] QR code generation
- [ ] Web Share API integration
- [ ] Social share buttons (WhatsApp, Telegram, Email, SMS)

### Phase 7: UI States
- [ ] Loading states
  - [ ] Page skeleton loader
  - [ ] OCR processing spinner
  - [ ] Button loading states
- [ ] Error states
  - [ ] Full page error (404, expired)
  - [ ] Toast notification system
  - [ ] Inline field errors
- [ ] Empty states
  - [ ] No participants
  - [ ] No items
  - [ ] No assignments

### Phase 8: Form Validation
- [ ] Participant name validation
- [ ] Item validation (name, price, quantity)
- [ ] Percentage split validation (sum to 100%)
- [ ] Tax/service validation
- [ ] Real-time validation feedback

### Phase 9: Responsive Design
- [ ] Mobile layout (< 640px)
  - [ ] Single column stack
  - [ ] Bottom sheet for share
  - [ ] Collapsible sections
  - [ ] Touch-friendly targets (44px min)
- [ ] Tablet layout (768px - 1023px)
  - [ ] Two-column layout
  - [ ] Side panel for participants
- [ ] Desktop layout (≥ 1024px)
  - [ ] Three-column layout
  - [ ] Inline editing
  - [ ] Hover states

### Phase 10: Polish & Optimization
- [ ] Optimistic updates for better UX
- [ ] Debounced inputs for real-time sync
- [ ] Memoization for bill calculations
- [ ] Session expiration handling
- [ ] Session cleanup job
- [ ] Accessibility (ARIA labels, keyboard nav)

### Phase 11: Testing & Deployment
- [ ] Unit tests for calculations
- [ ] Unit tests for custom hooks
- [ ] Component tests
- [ ] Integration tests for API
- [ ] E2E tests for critical flows
- [ ] Docker build verification
- [ ] Production deployment

---

*This technical plan provides detailed specifications for implementing the Split Bill application. Each section can be referenced during development for consistent implementation.*
