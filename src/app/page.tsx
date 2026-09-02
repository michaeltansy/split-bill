'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import { AccountMenu } from '@/components/AccountMenu';
import { BankInfoForm } from '@/components/BankInfoForm';
import { useBillScan } from '@/hooks/useBillScan';
import { formatIDR } from '@/lib/format';
import type { BankInfoInput } from '@/types';

const OCR_ENABLED = process.env.NEXT_PUBLIC_OCR_ENABLED === 'true';

type DraftItem = {
  id: string;
  name: string;
  price: string;
  quantity: string;
};

function newDraftItem(): DraftItem {
  return { id: crypto.randomUUID(), name: '', price: '', quantity: '1' };
}

export default function Home() {
  const router = useRouter();
  const { addToast } = useToast();

  const [items, setItems] = useState<DraftItem[]>(() => [newDraftItem()]);
  const [taxAmount, setTaxAmount] = useState('');
  const [serviceAmount, setServiceAmount] = useState('');
  const [bankAccount, setBankAccount] = useState<BankInfoInput | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleBankChange = useCallback((value: BankInfoInput | null) => {
    setBankAccount(value);
  }, []);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { scan, isScanning, cooldownRemaining, isCoolingDown } = useBillScan();

  const handlePickFile = () => {
    if (isScanning || isCoolingDown || isCreating) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    const result = await scan(file);
    if (!result) {
      addToast('Could not extract bill. You can still fill the form manually.', 'error');
      return;
    }

    if (result.items.length === 0) {
      addToast('No items detected in the image. Please add them manually.', 'info');
      return;
    }

    setItems(
      result.items.map((i) => ({
        id: crypto.randomUUID(),
        name: i.name,
        price: String(i.price),
        quantity: String(i.quantity),
      }))
    );
    if (result.tax_amount > 0) setTaxAmount(String(result.tax_amount));
    if (result.service_amount > 0) setServiceAmount(String(result.service_amount));
    addToast(`Filled ${result.items.length} item(s). Review and edit before creating.`, 'success');
  };

  const { parsedItems, subtotal, taxNum, serviceNum, grandTotal, taxPct, servicePct } =
    useMemo(() => {
      const parsed = items
        .map((i) => ({
          name: i.name.trim(),
          price: parseFloat(i.price) || 0,
          quantity: Math.max(1, parseInt(i.quantity, 10) || 0),
        }))
        .filter((i) => i.name.length > 0 && i.price > 0);

      const sub = parsed.reduce((sum, i) => sum + i.price * i.quantity, 0);
      const tax = parseFloat(taxAmount) || 0;
      const service = parseFloat(serviceAmount) || 0;

      return {
        parsedItems: parsed,
        subtotal: sub,
        taxNum: tax,
        serviceNum: service,
        grandTotal: sub + tax + service,
        taxPct: sub > 0 ? (tax / sub) * 100 : 0,
        servicePct: sub > 0 ? (service / sub) * 100 : 0,
      };
    }, [items, taxAmount, serviceAmount]);

  const updateItem = (id: string, patch: Partial<Omit<DraftItem, 'id'>>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const addItem = () => setItems((prev) => [...prev, newDraftItem()]);

  const removeItem = (id: string) => {
    setItems((prev) => (prev.length === 1 ? [newDraftItem()] : prev.filter((i) => i.id !== id)));
  };

  const canSubmit = parsedItems.length > 0 && !isCreating;

  const handleCreateSession = async () => {
    if (!canSubmit) return;
    setIsCreating(true);
    try {
      const sessionRes = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subtotal,
          tax_amount: taxNum,
          service_amount: serviceNum,
          grand_total: grandTotal,
          tax_percentage: Math.round(taxPct * 100) / 100,
          service_percentage: Math.round(servicePct * 100) / 100,
          bank_account: bankAccount,
        }),
      });

      if (!sessionRes.ok) throw new Error('Failed to create session');
      const session = await sessionRes.json();

      const itemsRes = await fetch(`/api/sessions/${session.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: parsedItems }),
      });

      if (!itemsRes.ok) {
        addToast('Session created but items could not be saved.', 'error');
      }

      router.push(`/session/${session.id}`);
    } catch (err) {
      console.error('Failed to create session:', err);
      addToast('Failed to create session. Please try again.', 'error');
      setIsCreating(false);
    }
  };

  return (
    <main className="min-h-screen bg-surface-bg py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-end items-center gap-4 mb-4">
          <Link
            href="/sessions"
            className="text-sm font-medium text-text-secondary hover:text-brand-primary"
          >
            History
          </Link>
          <AccountMenu />
        </div>
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-2 text-text-primary">Split Bill</h1>
          <p className="text-text-primary">Add items, tax, and service fee — then create your session.</p>
        </header>

        {OCR_ENABLED && (
          <section className="mb-6">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={handlePickFile}
              disabled={isScanning || isCoolingDown || isCreating}
              title="Free Gemini tier — about 8 scans per minute. Manual entry has no limit."
              className="w-full border-2 border-dashed border-border-subtle rounded-2xl p-4 text-sm text-text-primary hover:border-brand-primary hover:bg-brand-primary-soft disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isScanning
                ? 'Scanning bill image…'
                : isCoolingDown
                ? `Wait ${cooldownRemaining}s before scanning again`
                : 'Have a bill photo? Tap to scan and auto-fill (optional)'}
            </button>
          </section>
        )}

        <section className="bg-surface-card rounded-2xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">Items</h2>
            <button
              onClick={addItem}
              disabled={isCreating}
              className="text-sm font-semibold text-brand-primary hover:text-brand-primary-hover hover:underline disabled:opacity-50"
            >
              + Add item
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={item.id} className="flex gap-2 items-end">
                <div className="flex-1">
                  {idx === 0 && (
                    <label className="block text-xs font-medium text-text-primary mb-1">Name</label>
                  )}
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => updateItem(item.id, { name: e.target.value })}
                    placeholder="Item name"
                    disabled={isCreating}
                    className="w-full px-3 py-2 border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100"
                  />
                </div>
                <div className="w-32">
                  {idx === 0 && (
                    <label className="block text-xs font-medium text-text-primary mb-1">Price (IDR)</label>
                  )}
                  <input
                    type="number"
                    inputMode="decimal"
                    step="1"
                    min="0"
                    value={item.price}
                    onChange={(e) => updateItem(item.id, { price: e.target.value })}
                    placeholder="0"
                    disabled={isCreating}
                    className="w-full px-3 py-2 border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100"
                  />
                </div>
                <div className="w-16">
                  {idx === 0 && (
                    <label className="block text-xs font-medium text-text-primary mb-1">Qty</label>
                  )}
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, { quantity: e.target.value })}
                    disabled={isCreating}
                    className="w-full px-3 py-2 border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100"
                  />
                </div>
                <button
                  onClick={() => removeItem(item.id)}
                  disabled={isCreating}
                  aria-label="Remove item"
                  className="p-2 text-status-danger hover:bg-red-50 rounded disabled:opacity-50"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-surface-card rounded-2xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 text-text-primary">Tax & Service</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Tax
                <span className="font-normal text-text-secondary ml-1">({taxPct.toFixed(1)}%)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-xs">IDR</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="1"
                  min="0"
                  value={taxAmount}
                  onChange={(e) => setTaxAmount(e.target.value)}
                  placeholder="0"
                  disabled={isCreating}
                  className="w-full pl-11 pr-3 py-2 border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Service
                <span className="font-normal text-text-secondary ml-1">({servicePct.toFixed(1)}%)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-xs">IDR</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="1"
                  min="0"
                  value={serviceAmount}
                  onChange={(e) => setServiceAmount(e.target.value)}
                  placeholder="0"
                  disabled={isCreating}
                  className="w-full pl-11 pr-3 py-2 border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="bg-surface-card rounded-2xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 text-text-primary">Payment Destination</h2>
          <BankInfoForm disabled={isCreating} onChange={handleBankChange} />
        </section>

        <section className="bg-surface-card rounded-2xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 text-text-primary">Summary</h2>
          <dl className="space-y-2 text-sm text-text-primary">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd className="font-medium">{formatIDR(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Tax</dt>
              <dd className="font-medium">{formatIDR(taxNum)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Service</dt>
              <dd className="font-medium">{formatIDR(serviceNum)}</dd>
            </div>
            <div className="flex justify-between pt-2 border-t border-border-subtle text-base">
              <dt className="font-semibold">Grand Total</dt>
              <dd className="font-bold">{formatIDR(grandTotal)}</dd>
            </div>
          </dl>
        </section>

        <button
          onClick={handleCreateSession}
          disabled={!canSubmit}
          className="w-full py-3 bg-brand-primary text-white text-lg font-semibold rounded-xl hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreating ? 'Creating session…' : 'Create Session'}
        </button>

        {parsedItems.length === 0 && (
          <p className="mt-3 text-center text-sm text-text-secondary">
            Add at least one item with a name and price to create a session.
          </p>
        )}
      </div>
    </main>
  );
}
