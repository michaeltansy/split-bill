# Split Bill - Development Task Breakdown

## Overview

This document breaks down the Split Bill application into actionable development tasks organized by phase. Each task includes estimated effort, dependencies, and priority level.

**Estimation Key:**
- **XS**: < 1 hour
- **S**: 1-2 hours
- **M**: 2-4 hours
- **L**: 4-8 hours
- **XL**: 8+ hours

**Priority Key:**
- **P0**: Critical - Blocks other work
- **P1**: High - Core functionality
- **P2**: Medium - Important features
- **P3**: Low - Nice to have

---

## Phase 1: Project Setup

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 1.1 | Initialize Next.js 14 project with TypeScript | S | P0 | - | [ ] |
| 1.2 | Configure Tailwind CSS | XS | P0 | 1.1 | [ ] |
| 1.3 | Set up project folder structure | S | P0 | 1.1 | [ ] |
| 1.4 | Create Supabase project | S | P0 | - | [ ] |
| 1.5 | Configure environment variables (.env.local, .env.example) | XS | P0 | 1.4 | [ ] |
| 1.6 | Set up Supabase client library | S | P0 | 1.1, 1.5 | [ ] |
| 1.7 | Run database migrations (create tables) | M | P0 | 1.4 | [ ] |
| 1.8 | Enable Supabase Realtime for tables | XS | P0 | 1.7 | [ ] |
| 1.9 | Create TypeScript type definitions | M | P0 | 1.1 | [ ] |
| 1.10 | Set up Docker configuration (Dockerfile, docker-compose.yml) | M | P1 | 1.1 | [ ] |
| 1.11 | Configure next.config.js for standalone output | XS | P1 | 1.1 | [ ] |
| 1.12 | Set up ESLint and Prettier | S | P2 | 1.1 | [ ] |

### Phase 1 Deliverables:
- [ ] Next.js project running locally
- [ ] Supabase database with all tables created
- [ ] Environment configuration complete
- [ ] Docker build working

---

## Phase 2: Custom Hooks

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 2.1 | Create `useSession` hook - data fetching | M | P0 | 1.6, 1.9 | [ ] |
| 2.2 | Add real-time subscriptions to `useSession` | M | P0 | 2.1, 1.8 | [ ] |
| 2.3 | Add CRUD actions to `useSession` | M | P0 | 2.1 | [ ] |
| 2.4 | Create `useOCR` hook | M | P1 | 1.9 | [ ] |
| 2.5 | Create `useBillCalculation` hook | M | P1 | 1.9 | [ ] |
| 2.6 | Create `useClipboard` hook | S | P2 | - | [ ] |
| 2.7 | Create `useShareSession` hook | S | P2 | 2.6 | [ ] |
| 2.8 | Create `useToast` hook for notifications | S | P2 | - | [ ] |

### Phase 2 Deliverables:
- [ ] All custom hooks implemented and tested
- [ ] Real-time data sync working

---

## Phase 3: Core UI Components

### 3.1 Layout Components

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 3.1.1 | Create root layout (app/layout.tsx) | S | P0 | 1.2 | [ ] |
| 3.1.2 | Create Header component | S | P1 | 3.1.1 | [ ] |
| 3.1.3 | Create Footer component | XS | P3 | 3.1.1 | [ ] |

### 3.2 ImageUploader Component

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 3.2.1 | Create DropZone with drag-and-drop | M | P1 | 1.2 | [ ] |
| 3.2.2 | Add file picker button | S | P1 | 3.2.1 | [ ] |
| 3.2.3 | Implement image preview | S | P1 | 3.2.1 | [ ] |
| 3.2.4 | Add file validation (type, size) | S | P1 | 3.2.1 | [ ] |
| 3.2.5 | Create processing indicator | S | P1 | 3.2.1 | [ ] |
| 3.2.6 | Integrate with useOCR hook | S | P1 | 3.2.1, 2.4 | [ ] |

### 3.3 ParticipantManager Component

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 3.3.1 | Create AddParticipantForm | S | P1 | 1.2 | [ ] |
| 3.3.2 | Add duplicate name validation | S | P1 | 3.3.1 | [ ] |
| 3.3.3 | Create ParticipantList | S | P1 | 1.2 | [ ] |
| 3.3.4 | Add remove participant functionality | S | P1 | 3.3.3 | [ ] |
| 3.3.5 | Add empty state | XS | P2 | 3.3.3 | [ ] |

### 3.4 ItemList Component

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 3.4.1 | Create ItemCard component | M | P1 | 1.2 | [ ] |
| 3.4.2 | Add editable item name | S | P1 | 3.4.1 | [ ] |
| 3.4.3 | Add editable item price | S | P1 | 3.4.1 | [ ] |
| 3.4.4 | Add delete item button | S | P1 | 3.4.1 | [ ] |
| 3.4.5 | Create AddItemForm | S | P1 | 1.2 | [ ] |
| 3.4.6 | Add assignment status indicator | S | P2 | 3.4.1 | [ ] |
| 3.4.7 | Add empty state | XS | P2 | 3.4.1 | [ ] |

### 3.5 ItemAssignment Component

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 3.5.1 | Create participant checkbox list | M | P1 | 1.2 | [ ] |
| 3.5.2 | Add split type toggle (equal/percentage) | S | P1 | 3.5.1 | [ ] |
| 3.5.3 | Create percentage input fields | M | P1 | 3.5.2 | [ ] |
| 3.5.4 | Add percentage validation (sum to 100%) | S | P1 | 3.5.3 | [ ] |
| 3.5.5 | Show validation error message | XS | P1 | 3.5.4 | [ ] |

### 3.6 TaxServiceInput Component

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 3.6.1 | Create amount input fields | M | P1 | 1.2 | [ ] |
| 3.6.2 | Display calculated percentages | S | P1 | 3.6.1 | [ ] |
| 3.6.3 | Add auto-recalculation on change | S | P1 | 3.6.1 | [ ] |
| 3.6.4 | Add validation indicator | S | P2 | 3.6.1 | [ ] |
| 3.6.5 | Create ReceiptSummary wrapper | S | P1 | 3.6.1 | [ ] |

### 3.7 BillSummary Component

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 3.7.1 | Create ParticipantBillCard | M | P1 | 1.2, 2.5 | [ ] |
| 3.7.2 | Add collapsible/expandable behavior | S | P1 | 3.7.1 | [ ] |
| 3.7.3 | Create item breakdown list | M | P1 | 3.7.1 | [ ] |
| 3.7.4 | Show tax/service breakdown | S | P1 | 3.7.1 | [ ] |
| 3.7.5 | Add copy bill button | S | P2 | 3.7.1, 2.6 | [ ] |
| 3.7.6 | Create SummaryHeader with grand total | S | P1 | 3.7.1 | [ ] |
| 3.7.7 | Add unassigned items warning | S | P2 | 3.7.6 | [ ] |

### Phase 3 Deliverables:
- [ ] All UI components implemented
- [ ] Components are responsive
- [ ] Components handle all states (loading, error, empty)

---

## Phase 4: API Routes

### 4.1 Sessions API

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 4.1.1 | POST /api/sessions - Create session | M | P0 | 1.6 | [ ] |
| 4.1.2 | GET /api/sessions/[id] - Get session with related data | M | P0 | 1.6 | [ ] |
| 4.1.3 | PATCH /api/sessions/[id] - Update session | S | P0 | 1.6 | [ ] |

### 4.2 Participants API

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 4.2.1 | POST /api/sessions/[id]/participants - Add participant | S | P0 | 1.6 | [ ] |
| 4.2.2 | DELETE /api/sessions/[id]/participants/[pid] - Remove participant | S | P0 | 1.6 | [ ] |

### 4.3 Items API

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 4.3.1 | POST /api/sessions/[id]/items - Add item | S | P0 | 1.6 | [ ] |
| 4.3.2 | PATCH /api/sessions/[id]/items/[itemId] - Update item | S | P0 | 1.6 | [ ] |
| 4.3.3 | DELETE /api/sessions/[id]/items/[itemId] - Delete item | S | P0 | 1.6 | [ ] |
| 4.3.4 | POST /api/sessions/[id]/items/bulk - Bulk create items | M | P1 | 1.6 | [ ] |

### 4.4 Assignments API

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 4.4.1 | PUT /api/items/[itemId]/assignments - Set assignments | M | P0 | 1.6 | [ ] |

### 4.5 OCR API

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 4.5.1 | Install and configure @aspect-guten/ocr | M | P1 | 1.1 | [ ] |
| 4.5.2 | Create receipt parser utility | L | P1 | 4.5.1 | [ ] |
| 4.5.3 | POST /api/ocr - Process receipt image | M | P1 | 4.5.1, 4.5.2 | [ ] |
| 4.5.4 | Add percentage back-calculation | S | P1 | 4.5.3 | [ ] |

### Phase 4 Deliverables:
- [ ] All API routes implemented
- [ ] API error handling consistent
- [ ] OCR processing working

---

## Phase 5: Page Implementation

### 5.1 Home Page

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 5.1.1 | Create home page layout | S | P0 | 3.1.1 | [ ] |
| 5.1.2 | Integrate ImageUploader | S | P0 | 5.1.1, 3.2.6 | [ ] |
| 5.1.3 | Add "Start without image" button | S | P1 | 5.1.1 | [ ] |
| 5.1.4 | Implement OCR processing flow | M | P1 | 5.1.2, 4.5.3 | [ ] |
| 5.1.5 | Create session and redirect | S | P0 | 5.1.4, 4.1.1 | [ ] |
| 5.1.6 | Add loading state during OCR | S | P1 | 5.1.4 | [ ] |
| 5.1.7 | Add error handling for OCR failure | S | P1 | 5.1.4 | [ ] |

### 5.2 Session Page - Owner View

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 5.2.1 | Create session page layout | M | P0 | 3.1.1 | [ ] |
| 5.2.2 | Fetch session data with useSession | S | P0 | 5.2.1, 2.1 | [ ] |
| 5.2.3 | Add receipt preview (collapsible) | S | P2 | 5.2.1 | [ ] |
| 5.2.4 | Integrate ReceiptSummary/TaxServiceInput | S | P0 | 5.2.1, 3.6.5 | [ ] |
| 5.2.5 | Integrate ParticipantManager | S | P0 | 5.2.1, 3.3.1 | [ ] |
| 5.2.6 | Integrate ItemList with assignments | M | P0 | 5.2.1, 3.4.1, 3.5.1 | [ ] |
| 5.2.7 | Integrate BillSummary | S | P0 | 5.2.1, 3.7.1 | [ ] |
| 5.2.8 | Connect real-time subscriptions | M | P1 | 5.2.2, 2.2 | [ ] |
| 5.2.9 | Implement desktop three-column layout | M | P1 | 5.2.1 | [ ] |
| 5.2.10 | Implement tablet two-column layout | S | P2 | 5.2.1 | [ ] |
| 5.2.11 | Implement mobile single-column layout | S | P1 | 5.2.1 | [ ] |
| 5.2.12 | Add session not found/expired handling | S | P1 | 5.2.2 | [ ] |

### 5.3 Session Page - Participant View

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 5.3.1 | Detect participant mode via query param | S | P1 | 5.2.1 | [ ] |
| 5.3.2 | Create simplified item selection UI | M | P1 | 5.3.1 | [ ] |
| 5.3.3 | Show shared items section | M | P1 | 5.3.1 | [ ] |
| 5.3.4 | Allow percentage input for shared items | S | P1 | 5.3.3 | [ ] |
| 5.3.5 | Display personal bill summary | S | P1 | 5.3.1, 3.7.1 | [ ] |
| 5.3.6 | Add "Copy My Bill" button | S | P2 | 5.3.5, 2.6 | [ ] |

### Phase 5 Deliverables:
- [ ] Home page with OCR upload working
- [ ] Session page fully functional for owners
- [ ] Participant view working
- [ ] Responsive layouts implemented

---

## Phase 6: Share Functionality

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 6.1 | Create ShareModal component (desktop) | M | P1 | 1.2 | [ ] |
| 6.2 | Create ShareBottomSheet component (mobile) | M | P1 | 1.2 | [ ] |
| 6.3 | Implement link copy with feedback | S | P1 | 6.1, 2.6 | [ ] |
| 6.4 | Install QR code library | XS | P2 | - | [ ] |
| 6.5 | Create QRCodeView component | S | P2 | 6.4 | [ ] |
| 6.6 | Integrate Web Share API (mobile) | S | P2 | 6.2 | [ ] |
| 6.7 | Add social share buttons | M | P3 | 6.1 | [ ] |
| 6.8 | Add Share button to session header | S | P1 | 6.1, 5.2.1 | [ ] |

### Phase 6 Deliverables:
- [ ] Share modal/bottom sheet working
- [ ] Link copy with feedback
- [ ] QR code generation
- [ ] Native share on mobile

---

## Phase 7: UI States

### 7.1 Loading States

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 7.1.1 | Create Skeleton loader component | S | P1 | 1.2 | [ ] |
| 7.1.2 | Add skeleton to session page | S | P1 | 7.1.1, 5.2.1 | [ ] |
| 7.1.3 | Create Spinner component | XS | P1 | 1.2 | [ ] |
| 7.1.4 | Add OCR processing spinner overlay | S | P1 | 7.1.3, 5.1.4 | [ ] |
| 7.1.5 | Add button loading states | S | P1 | 7.1.3 | [ ] |

### 7.2 Error States

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 7.2.1 | Create Toast notification system | M | P1 | 1.2, 2.8 | [ ] |
| 7.2.2 | Create full-page error component | S | P1 | 1.2 | [ ] |
| 7.2.3 | Add session not found page | S | P1 | 7.2.2 | [ ] |
| 7.2.4 | Add session expired page | S | P1 | 7.2.2 | [ ] |
| 7.2.5 | Create inline field error component | S | P1 | 1.2 | [ ] |
| 7.2.6 | Add error handling to all API calls | M | P1 | 7.2.1 | [ ] |

### 7.3 Empty States

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 7.3.1 | Create EmptyState component | S | P2 | 1.2 | [ ] |
| 7.3.2 | Add empty state to ParticipantManager | XS | P2 | 7.3.1, 3.3.5 | [ ] |
| 7.3.3 | Add empty state to ItemList | XS | P2 | 7.3.1, 3.4.7 | [ ] |
| 7.3.4 | Add empty state to BillSummary | XS | P2 | 7.3.1, 3.7.1 | [ ] |

### Phase 7 Deliverables:
- [ ] All loading states implemented
- [ ] Error handling complete
- [ ] Empty states for all sections

---

## Phase 8: Form Validation

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 8.1 | Create validation utility functions | M | P1 | 1.9 | [ ] |
| 8.2 | Add participant name validation | S | P1 | 8.1, 3.3.1 | [ ] |
| 8.3 | Add item name/price/quantity validation | S | P1 | 8.1, 3.4.5 | [ ] |
| 8.4 | Add percentage split validation | S | P1 | 8.1, 3.5.4 | [ ] |
| 8.5 | Add tax/service validation | S | P1 | 8.1, 3.6.1 | [ ] |
| 8.6 | Implement real-time validation (on blur) | S | P1 | 8.1 | [ ] |
| 8.7 | Disable submit when form invalid | S | P1 | 8.6 | [ ] |

### Phase 8 Deliverables:
- [ ] All forms have validation
- [ ] Real-time validation feedback
- [ ] Error messages are user-friendly

---

## Phase 9: Responsive Design Polish

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 9.1 | Audit mobile layout (< 640px) | M | P1 | 5.2.11 | [ ] |
| 9.2 | Fix touch targets (min 44px) | S | P1 | 9.1 | [ ] |
| 9.3 | Add collapsible sections on mobile | S | P1 | 9.1 | [ ] |
| 9.4 | Audit tablet layout (768px - 1023px) | S | P2 | 5.2.10 | [ ] |
| 9.5 | Audit desktop layout (≥ 1024px) | S | P2 | 5.2.9 | [ ] |
| 9.6 | Add hover states for desktop | S | P2 | 9.5 | [ ] |
| 9.7 | Test on real devices | M | P1 | 9.1, 9.4, 9.5 | [ ] |

### Phase 9 Deliverables:
- [ ] Mobile layout polished
- [ ] Tablet layout polished
- [ ] Desktop layout polished
- [ ] Tested on real devices

---

## Phase 10: Polish & Optimization

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 10.1 | Implement optimistic updates | M | P2 | 2.3 | [ ] |
| 10.2 | Add debouncing to text inputs | S | P2 | 3.4.2, 3.4.3 | [ ] |
| 10.3 | Memoize bill calculations | S | P2 | 2.5 | [ ] |
| 10.4 | Add session expiration countdown | S | P3 | 5.2.1 | [ ] |
| 10.5 | Create Supabase Edge Function for cleanup | M | P2 | 1.4 | [ ] |
| 10.6 | Schedule cleanup cron job | S | P2 | 10.5 | [ ] |
| 10.7 | Add ARIA labels for accessibility | M | P2 | All components | [ ] |
| 10.8 | Add keyboard navigation | M | P2 | All components | [ ] |
| 10.9 | Optimize bundle size | S | P3 | All | [ ] |
| 10.10 | Add meta tags and OG images | S | P3 | 5.1.1 | [ ] |

### Phase 10 Deliverables:
- [ ] Performance optimized
- [ ] Accessibility improved
- [ ] Session cleanup automated

---

## Phase 11: Testing & Deployment

### 11.1 Unit Tests

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 11.1.1 | Set up Jest and React Testing Library | S | P1 | 1.1 | [ ] |
| 11.1.2 | Write tests for calculation logic | M | P1 | 2.5 | [ ] |
| 11.1.3 | Write tests for receipt parser | M | P1 | 4.5.2 | [ ] |
| 11.1.4 | Write tests for validation utilities | S | P1 | 8.1 | [ ] |
| 11.1.5 | Write tests for custom hooks | L | P2 | Phase 2 | [ ] |

### 11.2 Component Tests

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 11.2.1 | Write tests for ImageUploader | M | P2 | 3.2.6 | [ ] |
| 11.2.2 | Write tests for ItemAssignment | M | P2 | 3.5.5 | [ ] |
| 11.2.3 | Write tests for BillSummary | M | P2 | 3.7.7 | [ ] |

### 11.3 Integration Tests

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 11.3.1 | Set up API test environment | M | P1 | Phase 4 | [ ] |
| 11.3.2 | Write tests for Sessions API | M | P1 | 4.1.3 | [ ] |
| 11.3.3 | Write tests for Items API | M | P1 | 4.3.4 | [ ] |
| 11.3.4 | Write tests for Assignments API | M | P1 | 4.4.1 | [ ] |

### 11.4 E2E Tests

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 11.4.1 | Set up Playwright or Cypress | M | P2 | All | [ ] |
| 11.4.2 | Write E2E test: Create session flow | M | P2 | 11.4.1 | [ ] |
| 11.4.3 | Write E2E test: Participant claim items | M | P2 | 11.4.1 | [ ] |
| 11.4.4 | Write E2E test: Bill calculation | M | P2 | 11.4.1 | [ ] |

### 11.5 Deployment

| ID | Task | Estimate | Priority | Dependencies | Status |
|----|------|----------|----------|--------------|--------|
| 11.5.1 | Verify Docker build | S | P0 | 1.10, All | [ ] |
| 11.5.2 | Set up CI/CD pipeline | M | P1 | 11.5.1 | [ ] |
| 11.5.3 | Configure production environment | S | P0 | 11.5.1 | [ ] |
| 11.5.4 | Deploy to production | S | P0 | 11.5.3 | [ ] |
| 11.5.5 | Verify production deployment | S | P0 | 11.5.4 | [ ] |

### Phase 11 Deliverables:
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] E2E tests for critical flows
- [ ] Production deployment successful

---

## Summary

### Task Count by Phase

| Phase | Total Tasks | P0 | P1 | P2 | P3 |
|-------|-------------|----|----|----|----|
| Phase 1: Project Setup | 12 | 8 | 2 | 1 | 1 |
| Phase 2: Custom Hooks | 8 | 3 | 3 | 2 | 0 |
| Phase 3: Core Components | 35 | 1 | 27 | 6 | 1 |
| Phase 4: API Routes | 14 | 8 | 6 | 0 | 0 |
| Phase 5: Page Implementation | 21 | 7 | 12 | 2 | 0 |
| Phase 6: Share Functionality | 8 | 0 | 4 | 3 | 1 |
| Phase 7: UI States | 14 | 0 | 11 | 3 | 0 |
| Phase 8: Form Validation | 7 | 0 | 7 | 0 | 0 |
| Phase 9: Responsive Design | 7 | 0 | 4 | 3 | 0 |
| Phase 10: Polish & Optimization | 10 | 0 | 0 | 7 | 3 |
| Phase 11: Testing & Deployment | 18 | 4 | 9 | 5 | 0 |
| **TOTAL** | **154** | **31** | **85** | **32** | **6** |

### Estimated Total Effort

| Estimate | Count | Hours (avg) | Total Hours |
|----------|-------|-------------|-------------|
| XS (< 1h) | 18 | 0.5 | 9 |
| S (1-2h) | 68 | 1.5 | 102 |
| M (2-4h) | 56 | 3 | 168 |
| L (4-8h) | 10 | 6 | 60 |
| XL (8h+) | 2 | 10 | 20 |
| **TOTAL** | **154** | - | **~359 hours** |

### Recommended Sprint Plan (2-week sprints)

**Sprint 1 (P0 Focus):**
- Phase 1: Project Setup (all)
- Phase 2: Custom Hooks (2.1-2.3)
- Phase 4: API Routes (4.1, 4.2, 4.3.1-4.3.3, 4.4.1)

**Sprint 2 (Core UI):**
- Phase 2: Custom Hooks (remaining)
- Phase 3: Core Components (all P1 tasks)
- Phase 4: OCR API

**Sprint 3 (Pages):**
- Phase 5: Page Implementation (all)
- Phase 6: Share Functionality

**Sprint 4 (Polish):**
- Phase 7: UI States
- Phase 8: Form Validation
- Phase 9: Responsive Design

**Sprint 5 (Testing & Launch):**
- Phase 10: Polish & Optimization
- Phase 11: Testing & Deployment

---

## Dependencies Graph (Critical Path)

```
1.1 (Next.js) ─┬─▶ 1.2 (Tailwind) ─▶ 3.x (Components)
               │
               ├─▶ 1.3 (Structure) ─▶ 1.9 (Types) ─▶ 2.x (Hooks)
               │
               └─▶ 1.6 (Supabase) ─▶ 4.x (API) ─▶ 5.x (Pages)

1.4 (Supabase Project) ─▶ 1.7 (Migrations) ─▶ 1.8 (Realtime) ─▶ 2.2 (RT Hooks)

4.5.1 (OCR lib) ─▶ 4.5.2 (Parser) ─▶ 4.5.3 (OCR API) ─▶ 5.1.4 (OCR Flow)

All Components ─▶ Phase 7-9 (States/Validation/Responsive) ─▶ Phase 10-11 (Polish/Test)
```

---

*This task breakdown provides a structured approach to implementing the Split Bill application. Tasks can be assigned to team members and tracked using project management tools.*
