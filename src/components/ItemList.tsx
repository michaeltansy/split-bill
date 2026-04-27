'use client';

import { useState, useCallback } from 'react';
import type { Item, Participant, ItemAssignment } from '@/types';
import { ItemCard } from './ItemCard';

interface ItemListProps {
  items: Item[];
  participants: Participant[];
  assignments: ItemAssignment[];
  onAdd: (data: { name: string; price: number; quantity: number }) => Promise<void>;
  onUpdate: (id: string, data: { name?: string; price?: number; quantity?: number }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAssign: (itemId: string, assignments: { participant_id: string; share_percentage: number }[]) => Promise<void>;
  disabled?: boolean;
}

export function ItemList({
  items,
  participants,
  assignments,
  onAdd,
  onUpdate,
  onDelete,
  onAssign,
  disabled = false,
}: ItemListProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newQuantity, setNewQuantity] = useState('1');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const name = newName.trim();
    const price = parseFloat(newPrice);
    const quantity = parseInt(newQuantity);

    if (!name) {
      setError('Item name is required');
      return;
    }
    if (isNaN(price) || price < 0) {
      setError('Valid price is required');
      return;
    }
    if (isNaN(quantity) || quantity < 1) {
      setError('Quantity must be at least 1');
      return;
    }

    setIsSaving(true);
    try {
      await onAdd({ name, price, quantity });
      setNewName('');
      setNewPrice('');
      setNewQuantity('1');
      setIsAdding(false);
    } catch (err) {
      setError('Failed to add item');
    } finally {
      setIsSaving(false);
    }
  }, [newName, newPrice, newQuantity, onAdd]);

  const getItemAssignments = (itemId: string) => {
    return assignments.filter((a) => a.item_id === itemId);
  };

  return (
    <div className="space-y-4">
      {items.length === 0 && !isAdding ? (
        <div className="text-center py-8 text-gray-500">
          <p>No items yet.</p>
          <button
            onClick={() => setIsAdding(true)}
            disabled={disabled}
            className="mt-2 text-blue-600 hover:underline disabled:opacity-50"
          >
            Add your first item
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                participants={participants}
                assignments={getItemAssignments(item.id)}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onAssign={onAssign}
                disabled={disabled}
              />
            ))}
          </div>

          {isAdding ? (
            <form onSubmit={handleAdd} className="border rounded-lg p-4 bg-gray-50 space-y-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Item name"
                disabled={isSaving}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <div className="flex gap-2">
                <div className="flex-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    placeholder="Price"
                    disabled={isSaving}
                    className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="w-20">
                  <input
                    type="number"
                    min="1"
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value)}
                    placeholder="Qty"
                    disabled={isSaving}
                    className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSaving ? 'Adding...' : 'Add Item'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setNewName('');
                    setNewPrice('');
                    setNewQuantity('1');
                    setError(null);
                  }}
                  disabled={isSaving}
                  className="px-3 py-2 border rounded hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              disabled={disabled}
              className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-gray-400 hover:text-gray-600 disabled:opacity-50"
            >
              + Add Item
            </button>
          )}
        </>
      )}
    </div>
  );
}
