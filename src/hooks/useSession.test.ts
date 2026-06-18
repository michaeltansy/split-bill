import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// --- Supabase channel mock -----------------------------------------------
// We capture each .on() callback so tests can fire realtime events manually.
type RealtimeHandler = (payload: { new?: unknown; old?: unknown }) => void
const capturedHandlers = new Map<string, RealtimeHandler>()

// vi.hoisted ensures mockChannel/mockSupabase are initialized before vi.mock factories run
const { mockChannel, mockSupabase } = vi.hoisted(() => {
  const mockChannel = { on: vi.fn(), subscribe: vi.fn() }
  const mockSupabase = { channel: vi.fn(), removeChannel: vi.fn() }
  return { mockChannel, mockSupabase }
})

vi.mock('@/lib/supabase', () => ({ supabase: mockSupabase }))

// -------------------------------------------------------------------------

import { useSession } from './useSession'
import type { Participant, Item, ItemAssignment } from '@/types'

const SESSION_ID = 'session-1'

const mockSession = {
  id: SESSION_ID, subtotal: 100, tax_amount: 10, service_amount: 5, grand_total: 115,
  tax_percentage: 10, service_percentage: 5, receipt_image_url: null,
  status: 'active', created_at: '2024-01-01', expires_at: '2025-01-01', created_by: 'u1',
}

const mockParticipants: Participant[] = [
  { id: 'p1', session_id: SESSION_ID, name: 'Alice', created_at: '2024-01-01', is_paid: false, paid_at: null },
  { id: 'p2', session_id: SESSION_ID, name: 'Bob', created_at: '2024-01-01', is_paid: false, paid_at: null },
]

const mockItems = [
  { id: 'i1', session_id: SESSION_ID, name: 'Pizza', price: 50000, quantity: 1, created_at: '2024-01-01', assignments: [] },
]

function stubFetch(response: unknown, ok = true, status = ok ? 200 : 400) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok, status,
    json: () => Promise.resolve(response),
  }))
}

function stubFetchSequence(responses: Array<{ ok?: boolean; body: unknown }>) {
  const fetchMock = vi.fn()
  responses.forEach(({ ok = true, body }) => {
    fetchMock.mockResolvedValueOnce({ ok, status: ok ? 200 : 400, json: () => Promise.resolve(body) })
  })
  vi.stubGlobal('fetch', fetchMock)
}

describe('useSession', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    capturedHandlers.clear()
    // Restore mockChannel.on's implementation after resetAllMocks
    mockChannel.on.mockImplementation(function (
      _type: string,
      filter: { event: string; table: string },
      callback: RealtimeHandler
    ) {
      capturedHandlers.set(`${filter.event}:${filter.table}`, callback)
      return mockChannel
    })
    mockChannel.subscribe.mockReturnThis()
    mockSupabase.channel.mockReturnValue(mockChannel)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('initial data load', () => {
    it('starts in loading state with empty data', () => {
      stubFetch({ session: mockSession, participants: [], items: [], bank_account: null })
      const { result } = renderHook(() => useSession(SESSION_ID))
      expect(result.current.isLoading).toBe(true)
      expect(result.current.session).toBeNull()
    })

    it('populates state after a successful fetch', async () => {
      stubFetch({ session: mockSession, participants: mockParticipants, items: mockItems, bank_account: null })
      const { result } = renderHook(() => useSession(SESSION_ID))

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(result.current.session).toEqual(mockSession)
      expect(result.current.participants).toEqual(mockParticipants)
      expect(result.current.items).toEqual(mockItems)
      expect(result.current.bankAccount).toBeNull()
    })

    it('sets error when the fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')))
      const { result } = renderHook(() => useSession(SESSION_ID))

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(result.current.error).toBeInstanceOf(Error)
      expect(result.current.error?.message).toBe('Network down')
    })

    it('sets error when the API returns a non-ok status', async () => {
      stubFetch({ error: 'Session not found' }, false)
      const { result } = renderHook(() => useSession(SESSION_ID))

      await waitFor(() => expect(result.current.isLoading).toBe(false))

      expect(result.current.error).toBeInstanceOf(Error)
    })
  })

  describe('markPaid', () => {
    it('optimistically flips is_paid before the API call completes', async () => {
      stubFetchSequence([
        { body: { session: mockSession, participants: mockParticipants, items: [], bank_account: null } },
        { body: { id: 'p1', is_paid: true } },
      ])
      const { result } = renderHook(() => useSession(SESSION_ID))
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      // Kick off markPaid without awaiting so we can inspect the optimistic state
      act(() => { result.current.markPaid('p1', true) })

      expect(result.current.participants.find(p => p.id === 'p1')?.is_paid).toBe(true)
    })

    it('rolls back is_paid when the API call fails', async () => {
      stubFetchSequence([
        { body: { session: mockSession, participants: mockParticipants, items: [], bank_account: null } },
        { ok: false, body: { error: 'Server error' } },
      ])
      const { result } = renderHook(() => useSession(SESSION_ID))
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      await act(async () => {
        await result.current.markPaid('p1', true).catch(() => {})
      })

      expect(result.current.participants.find(p => p.id === 'p1')?.is_paid).toBe(false)
    })
  })

  describe('local state mutations', () => {
    it('applyAssignmentLocally adds a new assignment to the matching item', async () => {
      stubFetch({ session: mockSession, participants: mockParticipants, items: mockItems, bank_account: null })
      const { result } = renderHook(() => useSession(SESSION_ID))
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const assignment: ItemAssignment = {
        id: 'a1', item_id: 'i1', session_id: SESSION_ID, participant_id: 'p1',
        split_type: 'equal', percentage: null, unit_count: null, created_at: '2024-01-01',
      }

      act(() => result.current.applyAssignmentLocally(assignment))

      expect(result.current.items[0].assignments).toHaveLength(1)
      expect(result.current.items[0].assignments[0].id).toBe('a1')
    })

    it('applyAssignmentLocally updates an existing assignment (idempotent)', async () => {
      const existingAssignment: ItemAssignment = {
        id: 'a1', item_id: 'i1', session_id: SESSION_ID, participant_id: 'p1',
        split_type: 'equal', percentage: null, unit_count: null, created_at: '2024-01-01',
      }
      const itemsWithAssignment = [{ ...mockItems[0], assignments: [existingAssignment] }]
      stubFetch({ session: mockSession, participants: mockParticipants, items: itemsWithAssignment, bank_account: null })
      const { result } = renderHook(() => useSession(SESSION_ID))
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      const updated = { ...existingAssignment, split_type: 'percentage' as const, percentage: 60 }
      act(() => result.current.applyAssignmentLocally(updated))

      const assignments = result.current.items[0].assignments
      expect(assignments).toHaveLength(1)
      expect(assignments[0].split_type).toBe('percentage')
    })

    it('removeAssignmentLocally removes the matching assignment', async () => {
      const assignment: ItemAssignment = {
        id: 'a1', item_id: 'i1', session_id: SESSION_ID, participant_id: 'p1',
        split_type: 'equal', percentage: null, unit_count: null, created_at: '2024-01-01',
      }
      stubFetch({ session: mockSession, participants: mockParticipants, items: [{ ...mockItems[0], assignments: [assignment] }], bank_account: null })
      const { result } = renderHook(() => useSession(SESSION_ID))
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      act(() => result.current.removeAssignmentLocally('i1', 'p1'))

      expect(result.current.items[0].assignments).toHaveLength(0)
    })
  })

  describe('realtime event handlers', () => {
    async function loadAndWait() {
      stubFetch({ session: mockSession, participants: mockParticipants, items: mockItems, bank_account: null })
      const hook = renderHook(() => useSession(SESSION_ID))
      await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
      return hook
    }

    it('INSERT on participants appends a new participant', async () => {
      const { result } = await loadAndWait()
      const newP: Participant = { id: 'p3', session_id: SESSION_ID, name: 'Carol', created_at: '2024-01-01', is_paid: false, paid_at: null }
      act(() => capturedHandlers.get('INSERT:participants')?.({ new: newP }))
      expect(result.current.participants).toHaveLength(3)
      expect(result.current.participants[2].name).toBe('Carol')
    })

    it('INSERT on participants is idempotent (no duplicates)', async () => {
      const { result } = await loadAndWait()
      act(() => capturedHandlers.get('INSERT:participants')?.({ new: mockParticipants[0] }))
      expect(result.current.participants).toHaveLength(2)
    })

    it('UPDATE on participants patches the matching participant', async () => {
      const { result } = await loadAndWait()
      act(() => capturedHandlers.get('UPDATE:participants')?.({ new: { ...mockParticipants[0], is_paid: true } }))
      expect(result.current.participants.find(p => p.id === 'p1')?.is_paid).toBe(true)
    })

    it('DELETE on participants removes the matching participant', async () => {
      const { result } = await loadAndWait()
      act(() => capturedHandlers.get('DELETE:participants')?.({ old: { id: 'p1' } }))
      expect(result.current.participants.find(p => p.id === 'p1')).toBeUndefined()
      expect(result.current.participants).toHaveLength(1)
    })

    it('INSERT on items appends a new item with empty assignments', async () => {
      const { result } = await loadAndWait()
      const newItem: Item = { id: 'i2', session_id: SESSION_ID, name: 'Salad', price: 30000, quantity: 1, created_at: '2024-01-01' }
      act(() => capturedHandlers.get('INSERT:items')?.({ new: newItem }))
      const found = result.current.items.find(i => i.id === 'i2')
      expect(found).toBeDefined()
      expect(found?.assignments).toEqual([])
    })

    it('UPDATE on items patches name/price but preserves assignments', async () => {
      const assignment: ItemAssignment = { id: 'a1', item_id: 'i1', session_id: SESSION_ID, participant_id: 'p1', split_type: 'equal', percentage: null, unit_count: null, created_at: '2024-01-01' }
      stubFetch({ session: mockSession, participants: mockParticipants, items: [{ ...mockItems[0], assignments: [assignment] }], bank_account: null })
      const { result } = renderHook(() => useSession(SESSION_ID))
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      act(() => capturedHandlers.get('UPDATE:items')?.({ new: { ...mockItems[0], price: 55000 } }))
      const item = result.current.items.find(i => i.id === 'i1')!
      expect(item.price).toBe(55000)
      expect(item.assignments).toHaveLength(1)
    })

    it('DELETE on items removes the matching item', async () => {
      const { result } = await loadAndWait()
      act(() => capturedHandlers.get('DELETE:items')?.({ old: { id: 'i1' } }))
      expect(result.current.items.find(i => i.id === 'i1')).toBeUndefined()
    })

    it('INSERT on item_assignments merges the assignment into the correct item', async () => {
      const { result } = await loadAndWait()
      const newA: ItemAssignment = { id: 'a1', item_id: 'i1', session_id: SESSION_ID, participant_id: 'p1', split_type: 'equal', percentage: null, unit_count: null, created_at: '2024-01-01' }
      act(() => capturedHandlers.get('INSERT:item_assignments')?.({ new: newA }))
      expect(result.current.items[0].assignments).toHaveLength(1)
    })

    it('DELETE on item_assignments removes the assignment from the item', async () => {
      const assignment: ItemAssignment = { id: 'a1', item_id: 'i1', session_id: SESSION_ID, participant_id: 'p1', split_type: 'equal', percentage: null, unit_count: null, created_at: '2024-01-01' }
      stubFetch({ session: mockSession, participants: mockParticipants, items: [{ ...mockItems[0], assignments: [assignment] }], bank_account: null })
      const { result } = renderHook(() => useSession(SESSION_ID))
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      act(() => capturedHandlers.get('DELETE:item_assignments')?.({ old: { item_id: 'i1', participant_id: 'p1' } }))
      expect(result.current.items[0].assignments).toHaveLength(0)
    })
  })

  describe('CRUD action methods', () => {
    beforeEach(() => {
      stubFetch({ session: mockSession, participants: [], items: [], bank_account: null })
    })

    it('addParticipants POSTs names and returns the created participants', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ session: mockSession, participants: [], items: [], bank_account: null }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ id: 'p1', name: 'Alice' }]) })
      vi.stubGlobal('fetch', fetchMock)

      const { result } = renderHook(() => useSession(SESSION_ID))
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      let added: Participant[] = []
      await act(async () => { added = await result.current.addParticipants(['Alice']) })

      expect(added[0].name).toBe('Alice')
      const [, opts] = fetchMock.mock.calls[1]
      expect(JSON.parse(opts.body).names).toEqual(['Alice'])
    })

    it('claimItem sends a POST with split_type equal', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ session: mockSession, participants: [], items: [], bank_account: null }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      vi.stubGlobal('fetch', fetchMock)

      const { result } = renderHook(() => useSession(SESSION_ID))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      await act(async () => { await result.current.claimItem('i1', 'p1') })

      const [url, opts] = fetchMock.mock.calls[1]
      expect(url).toContain('/api/items/i1/assignments/p1')
      expect(JSON.parse(opts.body).split_type).toBe('equal')
    })

    it('unclaimItem sends a DELETE', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ session: mockSession, participants: [], items: [], bank_account: null }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      vi.stubGlobal('fetch', fetchMock)

      const { result } = renderHook(() => useSession(SESSION_ID))
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      await act(async () => { await result.current.unclaimItem('i1', 'p1') })

      const [url, opts] = fetchMock.mock.calls[1]
      expect(url).toContain('/api/items/i1/assignments/p1')
      expect(opts.method).toBe('DELETE')
    })
  })

  it('unsubscribes the Supabase channel on unmount', async () => {
    stubFetch({ session: mockSession, participants: [], items: [], bank_account: null })
    const { result, unmount } = renderHook(() => useSession(SESSION_ID))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    unmount()
    expect(mockSupabase.removeChannel).toHaveBeenCalledWith(mockChannel)
  })
})
