import type { OCRResult, OCRItem } from '@/types';
import { calculatePercentages } from './calculations';

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

function parsePrice(priceStr: string): number {
  return parseFloat(priceStr.replace(',', '.'));
}

export function parseReceiptText(text: string): OCRResult {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

  const items: OCRItem[] = [];
  let subtotal: number | null = null;
  let taxAmount: number | null = null;
  let serviceAmount: number | null = null;
  let grandTotal: number | null = null;

  for (const line of lines) {
    // Check for subtotal
    const subtotalMatch = line.match(PATTERNS.subtotal);
    if (subtotalMatch) {
      subtotal = parsePrice(subtotalMatch[2]);
      continue;
    }

    // Check for tax
    const taxMatch = line.match(PATTERNS.tax);
    if (taxMatch) {
      taxAmount = parsePrice(taxMatch[2]);
      continue;
    }

    // Check for service
    const serviceMatch = line.match(PATTERNS.service);
    if (serviceMatch) {
      serviceAmount = parsePrice(serviceMatch[2]);
      continue;
    }

    // Check for total
    const totalMatch = line.match(PATTERNS.total);
    if (totalMatch) {
      grandTotal = parsePrice(totalMatch[2]);
      continue;
    }

    // Check for quantity prefix item
    const qtyMatch = line.match(PATTERNS.quantityPrefix);
    if (qtyMatch) {
      items.push({
        name: qtyMatch[2].trim(),
        price: parsePrice(qtyMatch[3]) / parseInt(qtyMatch[1]),
        quantity: parseInt(qtyMatch[1]),
      });
      continue;
    }

    // Check for regular item line
    const itemMatch = line.match(PATTERNS.itemLine);
    if (itemMatch) {
      const name = itemMatch[1].trim();
      // Skip if it looks like a summary line
      if (
        name.toLowerCase().includes('subtotal') ||
        name.toLowerCase().includes('total') ||
        name.toLowerCase().includes('tax') ||
        name.toLowerCase().includes('service')
      ) {
        continue;
      }
      items.push({
        name,
        price: parsePrice(itemMatch[2]),
        quantity: 1,
      });
    }
  }

  // Calculate percentages if we have the necessary values
  let taxPercentage: number | null = null;
  let servicePercentage: number | null = null;

  if (subtotal !== null && subtotal > 0) {
    if (taxAmount !== null) {
      taxPercentage = Math.round((taxAmount / subtotal) * 100 * 100) / 100;
    }
    if (serviceAmount !== null) {
      servicePercentage = Math.round((serviceAmount / subtotal) * 100 * 100) / 100;
    }
  }

  return {
    items,
    subtotal,
    tax_amount: taxAmount,
    service_amount: serviceAmount,
    grand_total: grandTotal,
    tax_percentage: taxPercentage,
    service_percentage: servicePercentage,
    raw_text: text,
    confidence: items.length > 0 ? 0.8 : 0.2,
  };
}
