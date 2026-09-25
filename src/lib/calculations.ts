import type {
  Session,
  ItemWithAssignments,
  Participant,
  ParticipantBill,
} from '@/types';

export function calculateParticipantBills(
  session: Session,
  items: ItemWithAssignments[],
  participants: Participant[]
): ParticipantBill[] {
  const bills: ParticipantBill[] = participants.map((p) => ({
    participant: p,
    items: [],
    subtotal: 0,
    discount_share: 0,
    tax_share: 0,
    service_share: 0,
    total: 0,
  }));

  const participantMap = new Map(bills.map((b) => [b.participant.id, b]));

  for (const item of items) {
    if (item.assignments.length === 0) continue;

    const totalItemPrice = item.price * item.quantity;
    const assignedParticipants = item.assignments;

    for (const assignment of assignedParticipants) {
      const bill = participantMap.get(assignment.participant_id);
      if (!bill) continue;

      let shareAmount: number;
      let sharePercentage: number;

      if (assignment.split_type === 'percentage' && assignment.percentage !== null) {
        sharePercentage = assignment.percentage;
        shareAmount = (totalItemPrice * sharePercentage) / 100;
      } else if (
        assignment.split_type === 'unit' &&
        assignment.unit_count !== null &&
        item.quantity > 0
      ) {
        sharePercentage = (assignment.unit_count / item.quantity) * 100;
        shareAmount = assignment.unit_count * item.price;
      } else {
        sharePercentage = 100 / assignedParticipants.length;
        shareAmount = totalItemPrice / assignedParticipants.length;
      }

      const sharedWith = assignedParticipants
        .filter((a) => a.participant_id !== assignment.participant_id)
        .map((a) => {
          const p = participants.find((p) => p.id === a.participant_id);
          return p?.name || 'Unknown';
        });

      bill.items.push({
        item,
        share_amount: shareAmount,
        share_percentage: sharePercentage,
        split_type: assignment.split_type,
        unit_count: assignment.unit_count,
        shared_with: sharedWith,
      });

      bill.subtotal += shareAmount;
    }
  }

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
