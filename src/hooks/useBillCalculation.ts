'use client';

import { useMemo } from 'react';
import { calculateParticipantBills } from '@/lib/calculations';
import type { Session, ItemWithAssignments, Participant, ParticipantBill } from '@/types';

interface UseBillCalculationReturn {
  bills: ParticipantBill[];
  totalAssigned: number;
  totalUnassigned: number;
  isValid: boolean;
}

export function useBillCalculation(
  session: Session | null,
  items: ItemWithAssignments[],
  participants: Participant[]
): UseBillCalculationReturn {
  return useMemo(() => {
    if (!session) {
      return {
        bills: [],
        totalAssigned: 0,
        totalUnassigned: 0,
        isValid: false,
      };
    }

    const bills = calculateParticipantBills(session, items, participants);

    const totalAssigned = bills.reduce((sum, bill) => sum + bill.subtotal, 0);
    const totalItemsValue = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const totalUnassigned = Math.max(0, totalItemsValue - totalAssigned);

    const isValid =
      Math.abs(totalUnassigned) < 0.01 &&
      Math.abs(
        bills.reduce((sum, b) => sum + b.total, 0) - session.grand_total
      ) < 0.01;

    return {
      bills,
      totalAssigned: Math.round(totalAssigned * 100) / 100,
      totalUnassigned: Math.round(totalUnassigned * 100) / 100,
      isValid,
    };
  }, [session, items, participants]);
}

