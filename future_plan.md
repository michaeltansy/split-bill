# Split Bill - Future Enhancements

This document tracks features and improvements that were identified during the implementation verification but not yet completed. Items are organized by priority.

---

## Priority Legend

- **P1**: High - Should be done soon
- **P2**: Medium - Important but not urgent
- **P3**: Low - Nice to have

---

## P1 - High Priority

### CI/CD Pipeline

**Task ID**: 11.5.2

Set up continuous integration and deployment pipeline.

**Requirements**:
- GitHub Actions or similar CI/CD tool
- Run linting on PR
- Run tests on PR
- Build verification
- Automated deployment to staging/production

**Estimated Effort**: M (2-4 hours)

---

## P2 - Medium Priority

### Prettier Configuration

**Task ID**: 1.12

Add Prettier for consistent code formatting.

**Requirements**:
- Install prettier and eslint-config-prettier
- Create .prettierrc configuration
- Add format script to package.json
- Configure VSCode settings

**Estimated Effort**: S (1-2 hours)

---

### ARIA Accessibility Improvements

**Task ID**: 10.7

Add comprehensive ARIA labels for screen reader support.

**Requirements**:
- Add aria-label to all interactive elements
- Add aria-live regions for dynamic content updates
- Add aria-describedby for form validation errors
- Add role attributes where appropriate
- Test with screen readers (VoiceOver, NVDA)

**Estimated Effort**: M (2-4 hours)

---

### Keyboard Navigation

**Task ID**: 10.8

Implement full keyboard navigation support.

**Requirements**:
- Focus management for modals
- Tab order optimization
- Keyboard shortcuts for common actions
- Focus visible states
- Escape key to close modals/dropdowns

**Estimated Effort**: M (2-4 hours)

---

### Component Tests

**Task IDs**: 11.2.1, 11.2.2, 11.2.3

Write component tests using React Testing Library.

**Requirements**:
- ImageUploader component tests
- ItemAssignment component tests
- BillSummary component tests
- ParticipantManager component tests
- ShareModal component tests

**Estimated Effort**: L (4-8 hours)

---

### E2E Tests

**Task IDs**: 11.4.1 - 11.4.4

Set up end-to-end testing with Playwright or Cypress.

**Requirements**:
- Install and configure Playwright/Cypress
- Test: Create session flow (upload receipt -> OCR -> create session)
- Test: Participant claim items flow
- Test: Bill calculation accuracy
- Test: Share functionality

**Estimated Effort**: L (4-8 hours)

---

### Database Function: get_session_full()

**Task ID**: From tech_plan.md section 3.2

Create PostgreSQL function for efficient session data retrieval.

**Current State**: Using multiple direct queries in API routes

**Requirements**:
```sql
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

**Estimated Effort**: S (1-2 hours)

---

## P3 - Low Priority (Nice to Have)

### Social Share Buttons

**Task ID**: 6.7

Add dedicated social media share buttons.

**Requirements**:
- WhatsApp share button with deep link
- Telegram share button with deep link
- Email share button (mailto: link)
- SMS share button (sms: link on mobile)
- Platform detection for mobile vs desktop

**Implementation**:
```typescript
// Share URLs
const shareUrls = {
  whatsapp: `https://wa.me/?text=${encodeURIComponent(shareText)}`,
  telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  email: `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  sms: `sms:?body=${encodeURIComponent(text)}`, // iOS
  // sms:?body= for Android
};
```

**Estimated Effort**: M (2-4 hours)

---

### Session Expiration Countdown

**Task ID**: 10.4

Display countdown timer showing when session expires.

**Requirements**:
- Calculate remaining time from expires_at
- Display in human-readable format ("Expires in 5 days")
- Update periodically
- Warning state when < 24 hours remaining

**Estimated Effort**: S (1-2 hours)

---

### Bundle Size Optimization

**Task ID**: 10.9

Analyze and optimize JavaScript bundle size.

**Requirements**:
- Run bundle analyzer
- Identify large dependencies
- Consider code splitting
- Lazy load non-critical components
- Tree-shake unused code

**Estimated Effort**: S (1-2 hours)

---

## Completed Items Reference

For reference, these items from the original plan have been completed:

- [x] All P0 (Critical) tasks
- [x] All P1 (High) core functionality tasks
- [x] OCR integration with @gutenye/ocr-node
- [x] Real-time subscriptions via Supabase
- [x] Responsive design (mobile/tablet/desktop)
- [x] Toast notification system
- [x] Form validation with unit tests
- [x] Session cleanup Edge Function
- [x] Docker configuration
- [x] PWA manifest
- [x] QR code generation
- [x] Web Share API integration
- [x] Unit tests for calculations and validation

---

## Estimated Total Remaining Effort

| Priority | Tasks | Estimated Hours |
|----------|-------|-----------------|
| P1 | 1 | 3 |
| P2 | 5 | 17 |
| P3 | 3 | 7 |
| **Total** | **9** | **~27 hours** |

---

*Last updated: 2026-04-27*
