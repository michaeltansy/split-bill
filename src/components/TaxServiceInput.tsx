'use client';

import { useState, useEffect, useCallback } from 'react';
import type { DiscountType, Session } from '@/types';
import { computeSessionTotals } from '@/lib/calculations';
import { formatIDR } from '@/lib/format';
import { validateDiscount } from '@/lib/validation';
import { DiscountInput } from '@/components/DiscountInput';

interface TaxServiceInputProps {
  session: Session;
  onUpdate: (data: Partial<Session>) => Promise<void>;
  disabled?: boolean;
}

export function TaxServiceInput({
  session,
  onUpdate,
  disabled = false,
}: TaxServiceInputProps) {
  const [subtotal, setSubtotal] = useState(session.subtotal.toString());
  const [taxAmount, setTaxAmount] = useState(session.tax_amount.toString());
  const [serviceAmount, setServiceAmount] = useState(session.service_amount.toString());
  const [discountType, setDiscountType] = useState<DiscountType>(session.discount_type ?? 'percentage');
  const [discountValue, setDiscountValue] = useState(discountValueToString(session.discount_value));
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Calculate percentages
  const subtotalNum = parseFloat(subtotal) || 0;
  const taxNum = parseFloat(taxAmount) || 0;
  const serviceNum = parseFloat(serviceAmount) || 0;
  const discountNum = parseFloat(discountValue) || 0;
  const discountValidation = validateDiscount(discountType, discountValue, subtotalNum);
  const discountError = discountValidation.isValid ? undefined : discountValidation.error;

  // Preview only; the server recomputes these from the saved inputs.
  const {
    discount_amount: discountAmount,
    grand_total: grandTotal,
    tax_percentage: taxPercentage,
    service_percentage: servicePercentage,
  } = computeSessionTotals({
    subtotal: subtotalNum,
    discount_type: discountType,
    discount_value: discountNum,
    service_amount: serviceNum,
    tax_amount: taxNum,
  });

  // Sync with session changes
  useEffect(() => {
    setSubtotal(session.subtotal.toString());
    setTaxAmount(session.tax_amount.toString());
    setServiceAmount(session.service_amount.toString());
    setDiscountType(session.discount_type ?? 'percentage');
    setDiscountValue(discountValueToString(session.discount_value));
    setHasChanges(false);
  }, [
    session.subtotal,
    session.tax_amount,
    session.service_amount,
    session.discount_type,
    session.discount_value,
  ]);

  const handleDiscountChange = useCallback((type: DiscountType, value: string) => {
    setHasChanges(true);
    setDiscountType(type);
    setDiscountValue(value);
  }, []);

  const handleChange = useCallback((field: string, value: string) => {
    setHasChanges(true);
    switch (field) {
      case 'subtotal':
        setSubtotal(value);
        break;
      case 'tax':
        setTaxAmount(value);
        break;
      case 'service':
        setServiceAmount(value);
        break;
    }
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      // Only the inputs; derived totals come back through realtime.
      await onUpdate({
        subtotal: subtotalNum,
        tax_amount: taxNum,
        service_amount: serviceNum,
        discount_type: discountType,
        discount_value: discountNum,
      });
      setHasChanges(false);
    } finally {
      setIsSaving(false);
    }
  }, [subtotalNum, taxNum, serviceNum, discountType, discountNum, onUpdate]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">
            Subtotal
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-xs">IDR</span>
            <input
              type="number"
              step="1"
              min="0"
              value={subtotal}
              onChange={(e) => handleChange('subtotal', e.target.value)}
              disabled={disabled || isSaving}
              className="w-full pl-11 pr-3 py-2 border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100"
            />
          </div>
        </div>

        <DiscountInput
          type={discountType}
          value={discountValue}
          resolvedAmount={discountAmount}
          onChange={handleDiscountChange}
          error={discountError}
          disabled={disabled || isSaving}
        />

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">
            Tax
            <span className="font-normal text-text-secondary ml-1">
              ({taxPercentage.toFixed(1)}%)
            </span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-xs">IDR</span>
            <input
              type="number"
              step="1"
              min="0"
              value={taxAmount}
              onChange={(e) => handleChange('tax', e.target.value)}
              disabled={disabled || isSaving}
              className="w-full pl-11 pr-3 py-2 border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">
            Service
            <span className="font-normal text-text-secondary ml-1">
              ({servicePercentage.toFixed(1)}%)
            </span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-xs">IDR</span>
            <input
              type="number"
              step="1"
              min="0"
              value={serviceAmount}
              onChange={(e) => handleChange('service', e.target.value)}
              disabled={disabled || isSaving}
              className="w-full pl-11 pr-3 py-2 border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">
            Grand Total
          </label>
          <div className="px-3 py-2 bg-surface-bg border border-border-subtle rounded-lg font-semibold text-text-primary">
            {formatIDR(grandTotal)}
          </div>
        </div>
      </div>

      {hasChanges && (
        <button
          onClick={handleSave}
          disabled={isSaving || Boolean(discountError)}
          className="w-full py-2 bg-brand-primary text-white font-semibold rounded-xl hover:bg-brand-primary-hover disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      )}
    </div>
  );
}

function discountValueToString(value: number | null | undefined): string {
  return value ? value.toString() : '';
}
