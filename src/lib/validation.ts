export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export function validateParticipantName(
  name: string,
  existingNames: string[] = []
): ValidationResult {
  const trimmed = name.trim();

  if (!trimmed) {
    return { isValid: false, error: 'Name is required' };
  }

  if (trimmed.length < 1) {
    return { isValid: false, error: 'Name must be at least 1 character' };
  }

  if (trimmed.length > 50) {
    return { isValid: false, error: 'Name must be less than 50 characters' };
  }

  const isDuplicate = existingNames.some(
    (existing) => existing.toLowerCase() === trimmed.toLowerCase()
  );
  if (isDuplicate) {
    return { isValid: false, error: 'A participant with this name already exists' };
  }

  return { isValid: true };
}

export function validateItemName(name: string): ValidationResult {
  const trimmed = name.trim();

  if (!trimmed) {
    return { isValid: false, error: 'Item name is required' };
  }

  if (trimmed.length > 100) {
    return { isValid: false, error: 'Item name must be less than 100 characters' };
  }

  return { isValid: true };
}

export function validatePrice(price: string | number): ValidationResult {
  const num = typeof price === 'string' ? parseFloat(price) : price;

  if (isNaN(num)) {
    return { isValid: false, error: 'Price must be a valid number' };
  }

  if (num < 0) {
    return { isValid: false, error: 'Price cannot be negative' };
  }

  if (num > 999999.99) {
    return { isValid: false, error: 'Price is too large' };
  }

  return { isValid: true };
}

export function validateQuantity(quantity: string | number): ValidationResult {
  const num = typeof quantity === 'string' ? parseInt(quantity, 10) : quantity;

  if (isNaN(num)) {
    return { isValid: false, error: 'Quantity must be a valid number' };
  }

  if (!Number.isInteger(num)) {
    return { isValid: false, error: 'Quantity must be a whole number' };
  }

  if (num < 1) {
    return { isValid: false, error: 'Quantity must be at least 1' };
  }

  if (num > 999) {
    return { isValid: false, error: 'Quantity is too large' };
  }

  return { isValid: true };
}

export function validatePercentage(percentage: string | number): ValidationResult {
  const num = typeof percentage === 'string' ? parseFloat(percentage) : percentage;

  if (isNaN(num)) {
    return { isValid: false, error: 'Percentage must be a valid number' };
  }

  if (num < 0) {
    return { isValid: false, error: 'Percentage cannot be negative' };
  }

  if (num > 100) {
    return { isValid: false, error: 'Percentage cannot exceed 100%' };
  }

  return { isValid: true };
}

export function validatePercentageSum(percentages: number[]): ValidationResult {
  const sum = percentages.reduce((acc, p) => acc + p, 0);

  // Allow small floating point errors
  if (Math.abs(sum - 100) > 0.01) {
    return {
      isValid: false,
      error: `Percentages must add up to 100% (currently ${sum.toFixed(1)}%)`,
    };
  }

  return { isValid: true };
}

export function validateTaxOrService(amount: string | number): ValidationResult {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(num)) {
    return { isValid: false, error: 'Amount must be a valid number' };
  }

  if (num < 0) {
    return { isValid: false, error: 'Amount cannot be negative' };
  }

  if (num > 999999.99) {
    return { isValid: false, error: 'Amount is too large' };
  }

  return { isValid: true };
}

/**
 * Validate a bill-level discount against the subtotal it applies to.
 * Accepts raw form strings (an empty string means no discount) and untyped
 * API input, so the create form, owner edit and session routes share it.
 */
export function validateDiscount(
  type: unknown,
  value: unknown,
  subtotal: number
): ValidationResult {
  if (type !== 'percentage' && type !== 'amount') {
    return { isValid: false, error: 'Discount type must be percentage or amount' };
  }

  if (value === '' || value === null || value === undefined) {
    return { isValid: true };
  }

  const num = typeof value === 'string' ? Number(value) : value;

  if (typeof num !== 'number' || !Number.isFinite(num)) {
    return { isValid: false, error: 'Discount must be a valid number' };
  }

  if (num < 0) {
    return { isValid: false, error: 'Discount cannot be negative' };
  }

  if (type === 'percentage' && num > 100) {
    return { isValid: false, error: 'Discount cannot exceed 100%' };
  }

  if (type === 'amount' && num > subtotal) {
    return { isValid: false, error: 'Discount cannot exceed the subtotal' };
  }

  return { isValid: true };
}

// Helper to check if a form field has an error
export function hasError(result: ValidationResult): boolean {
  return !result.isValid;
}

// Helper to get error message or empty string
export function getErrorMessage(result: ValidationResult): string {
  return result.error || '';
}
