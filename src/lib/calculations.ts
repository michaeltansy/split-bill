import type {
  DiscountType,
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

  // Every share keeps 2 decimals, as before. Shares are allocated with the
  // largest-remainder method so each column sums exactly and, once every item
  // is assigned, the participant totals sum exactly to the session grand total.
  const weights = bills.map((b) => b.subtotal);
  const subtotals = allocateProportionally(sum(weights), weights, 2);
  const discounts = allocateProportionally(session.discount_amount ?? 0, weights, 2);
  const services = allocateProportionally(session.service_amount, weights, 2);
  const taxes = allocateProportionally(session.tax_amount, weights, 2);

  bills.forEach((bill, i) => {
    bill.subtotal = subtotals[i];
    bill.discount_share = discounts[i];
    bill.service_share = services[i];
    bill.tax_share = taxes[i];
    bill.total = round2(subtotals[i] - discounts[i] + services[i] + taxes[i]);
  });

  return bills;
}

/**
 * Tax and service as a percentage of the subtotal after discount. With no
 * discount this is the same calculation as before: amount / subtotal.
 */
export function calculatePercentages(
  subtotal: number,
  taxAmount: number,
  serviceAmount: number,
  discountAmount = 0
): { taxPercentage: number; servicePercentage: number } {
  const base = subtotal - discountAmount;
  if (base <= 0) {
    return { taxPercentage: 0, servicePercentage: 0 };
  }

  return {
    taxPercentage: round2((taxAmount / base) * 100),
    servicePercentage: round2((serviceAmount / base) * 100),
  };
}

/** Resolve the discount from user input: 2 decimals, clamped to [0, subtotal]. */
export function resolveDiscountAmount(
  subtotal: number,
  type: DiscountType,
  value: number
): number {
  if (!Number.isFinite(value) || value <= 0 || subtotal <= 0) return 0;

  const raw =
    type === 'percentage' ? (subtotal * Math.min(value, 100)) / 100 : value;

  return Math.min(round2(raw), subtotal);
}

export interface SessionTotalsInput {
  subtotal: number;
  discount_type: DiscountType;
  discount_value: number;
  service_amount: number;
  tax_amount: number;
}

export interface SessionTotals {
  discount_amount: number;
  grand_total: number;
  tax_percentage: number;
  service_percentage: number;
}

/** Canonical derived totals for a session row. */
export function computeSessionTotals(input: SessionTotalsInput): SessionTotals {
  const discount_amount = resolveDiscountAmount(
    input.subtotal,
    input.discount_type,
    input.discount_value
  );
  const { taxPercentage, servicePercentage } = calculatePercentages(
    input.subtotal,
    input.tax_amount,
    input.service_amount,
    discount_amount
  );

  return {
    discount_amount,
    grand_total: input.subtotal - discount_amount + input.service_amount + input.tax_amount,
    tax_percentage: taxPercentage,
    service_percentage: servicePercentage,
  };
}

/**
 * Split `total` across `weights` so the parts, each rounded to `decimals`
 * places, sum exactly to `total` (also rounded to `decimals`), using the
 * largest-remainder method. Leftover units go to the largest fractional parts;
 * ties go to the larger weight, then the lower index. Returns all zeros when
 * no weight is positive.
 */
export function allocateProportionally(
  total: number,
  weights: number[],
  decimals = 0
): number[] {
  const scale = 10 ** decimals;
  const parts = weights.map(() => 0);
  const intTotal = Math.round(total * scale);
  const clamped = weights.map((w) => (w > 0 ? w : 0));
  const weightSum = sum(clamped);

  if (intTotal === 0 || weightSum <= 0) return parts;

  const raw = clamped.map((w) => (intTotal * w) / weightSum);
  raw.forEach((r, i) => {
    parts[i] = Math.floor(r);
  });

  // Each floor drops < 1 unit, so the remainder never exceeds the number of
  // positive weights: at most one extra unit per participant.
  const remainder = intTotal - sum(parts);
  const order = raw
    .map((r, i) => ({ i, frac: r - parts[i] }))
    .filter(({ i }) => clamped[i] > 0)
    .sort(
      (a, b) =>
        (Math.abs(b.frac - a.frac) > 1e-9 ? b.frac - a.frac : 0) ||
        clamped[b.i] - clamped[a.i] ||
        a.i - b.i
    );

  for (let k = 0; k < remainder && k < order.length; k++) {
    parts[order[k].i] += 1;
  }

  return parts.map((p) => p / scale);
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
