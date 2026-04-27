# Split Bill Web Application - Implementation Plan

## Overview
A web application that allows users to split bills among participants by scanning receipts using OCR, managing shared items, and calculating individual totals including tax and service fees.

## Understanding of Requirements

### Core Features

#### 1. Image Upload
- Users can upload receipt/bill images (JPG, PNG, etc.)
- Preview uploaded image before processing
- Support drag-and-drop and file picker

#### 2. OCR Scanning
- Use `@aspect-guten/ocr` library (https://github.com/gutenye/ocr)
- Extract from receipt images:
  - Item names and prices
  - Subtotal amount
  - Tax amount (labeled as "Tax", "VAT", "PPN", etc.)
  - Service charge amount (labeled as "Service", "SC", etc.)
  - Grand total
- Back-calculate tax and service percentages from extracted amounts
- Allow manual editing of all extracted data for corrections

#### 3. Participant Management
- Add/remove participant names
- Each participant identified within a session

#### 4. Tax & Service Fee Calculation
- **Automatic Detection**: Extract tax and service fee amounts from receipt via OCR
- **Back-Calculation**: Calculate percentages automatically:
  - `Tax % = (Tax Amount / Subtotal) × 100`
  - `Service % = (Service Fee / Subtotal) × 100`
- **Manual Override**: Allow users to manually input/adjust percentages if OCR extraction fails or is inaccurate
- These are applied proportionally to each participant's subtotal

**OCR Extraction Targets:**
- Subtotal amount
- Tax amount (may be labeled as "Tax", "VAT", "PPN", etc.)
- Service charge amount (may be labeled as "Service", "Service Charge", "SC", etc.)
- Grand total (for validation: Subtotal + Tax + Service = Grand Total)

#### 5. Shareable Session Links
- Generate unique session ID/URL
- Share link with participants
- Participants can access the session and mark items they ordered
- Real-time or near-real-time updates

#### 6. Shared Item Handling
- Items can be assigned to multiple participants (2 or 3+ people)
- Two splitting modes:
  - **Proportional**: Split equally among selected participants
  - **Percentage**: Custom percentage allocation per participant

#### 7. Bill Summary
- Display at bottom of page
- For each participant:
  - List of their items (including partial items)
  - Subtotal of items
  - Their share of tax
  - Their share of service fee
  - **Final total** (items + tax + service)

#### 8. Session Retention
- Sessions persist for 1 week
- After 1 week, sessions are automatically cleaned up
- Use Supabase with TTL or scheduled cleanup

## Technical Architecture

### Tech Stack
- **Frontend**: Next.js with TypeScript
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **OCR**: @aspect-guten/ocr
- **Containerization**: Docker

### Database Schema (Supabase)

```sql
-- Sessions table
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '1 week'),
  subtotal DECIMAL(10,2) DEFAULT 0,          -- Extracted from receipt
  tax_amount DECIMAL(10,2) DEFAULT 0,        -- Extracted from receipt
  service_amount DECIMAL(10,2) DEFAULT 0,    -- Extracted from receipt
  grand_total DECIMAL(10,2) DEFAULT 0,       -- Extracted from receipt
  tax_percentage DECIMAL(5,2) DEFAULT 0,     -- Back-calculated or manual
  service_percentage DECIMAL(5,2) DEFAULT 0, -- Back-calculated or manual
  receipt_image_url TEXT,
  status VARCHAR(20) DEFAULT 'active'
);

-- Participants table
CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Items table (extracted from receipt)
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  quantity INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Item assignments (which participant owns which item)
CREATE TABLE item_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
  split_type VARCHAR(20) DEFAULT 'equal', -- 'equal' or 'percentage'
  percentage DECIMAL(5,2) DEFAULT NULL, -- used when split_type is 'percentage'
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Project Structure

```
splitbill/
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
├── next.config.js
├── .env.example
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Home page (create session)
│   │   ├── session/
│   │   │   └── [id]/
│   │   │       └── page.tsx      # Session page
│   │   └── api/
│   │       ├── sessions/
│   │       │   ├── route.ts      # Create session
│   │       │   └── [id]/
│   │       │       └── route.ts  # Get/update session
│   │       ├── items/
│   │       │   └── route.ts      # CRUD items
│   │       ├── participants/
│   │       │   └── route.ts      # CRUD participants
│   │       ├── assignments/
│   │       │   └── route.ts      # Assign items to participants
│   │       └── ocr/
│   │           └── route.ts      # Process image with OCR
│   ├── components/
│   │   ├── ImageUploader.tsx
│   │   ├── ItemList.tsx
│   │   ├── ParticipantManager.tsx
│   │   ├── ItemAssignment.tsx
│   │   ├── TaxServiceInput.tsx     # Shows extracted amounts & calculated %
│   │   ├── ReceiptSummary.tsx      # Subtotal, tax, service, grand total review
│   │   └── BillSummary.tsx
│   ├── lib/
│   │   ├── supabase.ts           # Supabase client
│   │   ├── ocr.ts                # OCR utilities (extract items, tax, service)
│   │   ├── receiptParser.ts      # Parse OCR output, identify tax/service lines
│   │   └── calculations.ts       # Bill calculation & percentage back-calculation
│   └── types/
│       └── index.ts              # TypeScript interfaces
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql
```

## Implementation Phases

### Phase 1: Project Setup
- Initialize Next.js project with TypeScript
- Configure Supabase connection
- Set up Docker configuration
- Create database schema

### Phase 2: Core Features
- Image upload component
- OCR integration
- Item management (add/edit/delete)
- Participant management

### Phase 3: Session & Sharing
- Session creation with unique URLs
- Session retrieval and real-time updates
- Share functionality

### Phase 4: Item Assignment & Splitting
- Checkbox interface for item claiming
- Shared item handling (proportional/percentage)
- Assignment persistence

### Phase 5: Bill Calculation & Summary
- Calculate individual totals
- Apply tax and service proportionally
- Display comprehensive summary

### Phase 6: Session Cleanup
- Implement 1-week expiration
- Scheduled cleanup job or Supabase TTL

## UI/UX Flow

1. **Home Page**: User uploads receipt image
2. **OCR Processing**: System extracts:
   - Individual items with prices
   - Subtotal, tax amount, service amount, grand total
   - Auto-calculates tax % and service % from extracted amounts
3. **Review & Edit**: User can correct any OCR errors (items, amounts, percentages)
4. **Setup**: Add participants
5. **Share**: Generate and copy session link
6. **Participant View**: Each participant marks their items
7. **Summary View**: See breakdown for all participants

## Key Considerations

- **Error Handling**: OCR may not be 100% accurate, allow manual corrections
- **Mobile Responsive**: Bill splitting often happens on phones
- **Real-time Updates**: Use Supabase realtime for live collaboration
- **Data Validation**: Ensure percentages sum to 100% for shared items
- **Session Security**: UUIDs provide sufficient obscurity for 1-week sessions

## Next Steps

Upon approval of this plan, I will:
1. Initialize the project structure
2. Set up Docker and Supabase configurations
3. Implement features in the order outlined above

---

*Please review this plan and let me know if any adjustments are needed before I proceed with implementation.*
