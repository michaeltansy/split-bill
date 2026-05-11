'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Session } from '@/types';

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
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Calculate percentages
  const subtotalNum = parseFloat(subtotal) || 0;
  const taxNum = parseFloat(taxAmount) || 0;
  const serviceNum = parseFloat(serviceAmount) || 0;
  const grandTotal = subtotalNum + taxNum + serviceNum;

  const taxPercentage = subtotalNum > 0 ? (taxNum / subtotalNum) * 100 : 0;
  const servicePercentage = subtotalNum > 0 ? (serviceNum / subtotalNum) * 100 : 0;

  // Sync with session changes
  useEffect(() => {
    setSubtotal(session.subtotal.toString());
    setTaxAmount(session.tax_amount.toString());
    setServiceAmount(session.service_amount.toString());
    setHasChanges(false);
  }, [session.subtotal, session.tax_amount, session.service_amount]);

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
      await onUpdate({
        subtotal: subtotalNum,
        tax_amount: taxNum,
        service_amount: serviceNum,
        grand_total: grandTotal,
        tax_percentage: Math.round(taxPercentage * 100) / 100,
        service_percentage: Math.round(servicePercentage * 100) / 100,
      });
      setHasChanges(false);
    } finally {
      setIsSaving(false);
    }
  }, [subtotalNum, taxNum, serviceNum, grandTotal, taxPercentage, servicePercentage, onUpdate]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Subtotal
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">IDR</span>
            <input
              type="number"
              step="1"
              min="0"
              value={subtotal}
              onChange={(e) => handleChange('subtotal', e.target.value)}
              disabled={disabled || isSaving}
              className="w-full pl-11 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tax
            <span className="font-normal text-gray-500 ml-1">
              ({taxPercentage.toFixed(1)}%)
            </span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">IDR</span>
            <input
              type="number"
              step="1"
              min="0"
              value={taxAmount}
              onChange={(e) => handleChange('tax', e.target.value)}
              disabled={disabled || isSaving}
              className="w-full pl-11 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Service
            <span className="font-normal text-gray-500 ml-1">
              ({servicePercentage.toFixed(1)}%)
            </span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">IDR</span>
            <input
              type="number"
              step="1"
              min="0"
              value={serviceAmount}
              onChange={(e) => handleChange('service', e.target.value)}
              disabled={disabled || isSaving}
              className="w-full pl-11 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Grand Total
          </label>
          <div className="px-3 py-2 bg-gray-100 border rounded-lg font-semibold">
            IDR {grandTotal.toFixed(0)}
          </div>
        </div>
      </div>

      {hasChanges && (
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      )}
    </div>
  );
}
