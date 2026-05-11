'use client';

import { useState, useCallback } from 'react';
import type { Item, Participant, ItemAssignment, SplitType } from '@/types';
import { formatIDR } from '@/lib/format';

export interface AssignmentPayload {
  participant_id: string;
  split_type: SplitType;
  percentage?: number;
  unit_count?: number;
}

interface ItemCardProps {
  item: Item;
  participants: Participant[];
  assignments: ItemAssignment[];
  onUpdate: (id: string, data: { name?: string; price?: number; quantity?: number }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAssign: (itemId: string, assignments: AssignmentPayload[]) => Promise<void>;
  disabled?: boolean;
}

export function ItemCard({
  item,
  participants,
  assignments,
  onUpdate,
  onDelete,
  onAssign,
  disabled = false,
}: ItemCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editPrice, setEditPrice] = useState(item.price.toString());
  const [editQuantity, setEditQuantity] = useState(item.quantity.toString());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Assignment state — initialised from existing assignments so re-opening the dialog
  // restores the previously chosen split type and values.
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(
    new Set(assignments.map((a) => a.participant_id))
  );
  const [splitType, setSplitType] = useState<SplitType>(
    () => (assignments[0]?.split_type as SplitType | undefined) ?? 'equal'
  );
  const [percentages, setPercentages] = useState<Record<string, number>>(() => {
    const result: Record<string, number> = {};
    assignments.forEach((a) => {
      result[a.participant_id] = a.percentage ?? (assignments.length > 0 ? 100 / assignments.length : 0);
    });
    return result;
  });
  const [unitCounts, setUnitCounts] = useState<Record<string, number>>(() => {
    const result: Record<string, number> = {};
    assignments.forEach((a) => {
      if (a.unit_count != null) result[a.participant_id] = a.unit_count;
    });
    return result;
  });

  const itemAssignments = assignments.filter((a) => a.item_id === item.id);
  const assignedNames = itemAssignments
    .map((a) => participants.find((p) => p.id === a.participant_id)?.name)
    .filter(Boolean)
    .join(', ');

  const handleSaveEdit = useCallback(async () => {
    const price = parseFloat(editPrice);
    const quantity = parseInt(editQuantity);

    if (!editName.trim() || isNaN(price) || price < 0 || isNaN(quantity) || quantity < 1) {
      return;
    }

    setIsSaving(true);
    try {
      await onUpdate(item.id, {
        name: editName.trim(),
        price,
        quantity,
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }, [item.id, editName, editPrice, editQuantity, onUpdate]);

  const handleDelete = useCallback(async () => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    setIsDeleting(true);
    try {
      await onDelete(item.id);
    } finally {
      setIsDeleting(false);
    }
  }, [item.id, onDelete]);

  const handleToggleParticipant = (participantId: string) => {
    const wasSelected = selectedParticipants.has(participantId);
    const newSelected = new Set(selectedParticipants);
    if (wasSelected) {
      newSelected.delete(participantId);
    } else {
      newSelected.add(participantId);
    }
    setSelectedParticipants(newSelected);

    // Auto-calculate equal percentages
    if (splitType === 'equal' && newSelected.size > 0) {
      const equalShare = 100 / newSelected.size;
      const newPercentages: Record<string, number> = {};
      newSelected.forEach((id) => {
        newPercentages[id] = equalShare;
      });
      setPercentages(newPercentages);
    }

    // Default unit counts when adding/removing in 'unit' mode
    if (splitType === 'unit') {
      const next = { ...unitCounts };
      if (wasSelected) {
        delete next[participantId];
      } else {
        const claimedByOthers = Array.from(newSelected)
          .filter((id) => id !== participantId)
          .reduce((sum, id) => sum + (next[id] || 0), 0);
        const remaining = Math.max(0, item.quantity - claimedByOthers);
        next[participantId] = remaining > 0 ? remaining : 1;
      }
      setUnitCounts(next);
    }
  };

  const handleSaveAssignment = useCallback(async () => {
    const assignmentData: AssignmentPayload[] = Array.from(selectedParticipants).map(
      (participantId) => {
        if (splitType === 'percentage') {
          return {
            participant_id: participantId,
            split_type: 'percentage',
            percentage: percentages[participantId] || 100 / selectedParticipants.size,
          };
        }
        if (splitType === 'unit') {
          return {
            participant_id: participantId,
            split_type: 'unit',
            unit_count: unitCounts[participantId] || 0,
          };
        }
        return {
          participant_id: participantId,
          split_type: 'equal',
          percentage: 100 / selectedParticipants.size,
        };
      }
    );

    setIsSaving(true);
    try {
      await onAssign(item.id, assignmentData);
      setIsAssigning(false);
    } finally {
      setIsSaving(false);
    }
  }, [item.id, selectedParticipants, splitType, percentages, unitCounts, onAssign]);

  const totalPercentage = Array.from(selectedParticipants).reduce(
    (sum, id) => sum + (percentages[id] || 0),
    0
  );
  const totalUnits = Array.from(selectedParticipants).reduce(
    (sum, id) => sum + (unitCounts[id] || 0),
    0
  );
  const unitsBalanced = totalUnits === item.quantity;

  if (isEditing) {
    return (
      <div className="border rounded-lg p-4 bg-blue-50">
        <div className="space-y-3">
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Item name"
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-500">Price</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="w-20">
              <label className="text-xs text-gray-500">Qty</label>
              <input
                type="number"
                min="1"
                value={editQuantity}
                onChange={(e) => setEditQuantity(e.target.value)}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSaveEdit}
              disabled={isSaving}
              className="flex-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setEditName(item.name);
                setEditPrice(item.price.toString());
                setEditQuantity(item.quantity.toString());
              }}
              disabled={isSaving}
              className="px-3 py-2 border rounded hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isAssigning) {
    return (
      <div className="border rounded-lg p-4 bg-green-50">
        <div className="mb-3 flex items-baseline gap-2 min-w-0">
          <span className="font-medium truncate min-w-0">{item.name}</span>
          <span className="text-gray-500 shrink-0">{formatIDR(item.price)}</span>
        </div>

        <div className="mb-3">
          <div className="flex flex-wrap gap-2 mb-2">
            <button
              onClick={() => setSplitType('equal')}
              className={`px-3 py-1 text-sm rounded ${
                splitType === 'equal' ? 'bg-green-600 text-white' : 'bg-gray-200'
              }`}
            >
              Equal Split
            </button>
            <button
              onClick={() => setSplitType('percentage')}
              className={`px-3 py-1 text-sm rounded ${
                splitType === 'percentage' ? 'bg-green-600 text-white' : 'bg-gray-200'
              }`}
            >
              Custom %
            </button>
            <button
              onClick={() => setSplitType('unit')}
              disabled={item.quantity < 2}
              title={item.quantity < 2 ? 'Item has only 1 unit — use Equal or %' : undefined}
              className={`px-3 py-1 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed ${
                splitType === 'unit' ? 'bg-green-600 text-white' : 'bg-gray-200'
              }`}
            >
              By Unit
            </button>
          </div>
          {splitType === 'unit' && (
            <p className="text-xs text-gray-600">
              Item has <span className="font-medium">{item.quantity}</span> units. Each person enters how many they took.
            </p>
          )}
        </div>

        <div className="space-y-2 mb-3">
          {participants.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`assign-${item.id}-${p.id}`}
                checked={selectedParticipants.has(p.id)}
                onChange={() => handleToggleParticipant(p.id)}
                className="w-4 h-4"
              />
              <label htmlFor={`assign-${item.id}-${p.id}`} className="flex-1 min-w-0 truncate">
                {p.name}
              </label>
              {splitType === 'percentage' && selectedParticipants.has(p.id) && (
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={percentages[p.id] || ''}
                    onChange={(e) =>
                      setPercentages({ ...percentages, [p.id]: parseFloat(e.target.value) || 0 })
                    }
                    className="w-16 px-2 py-1 border rounded text-sm"
                    placeholder="%"
                  />
                  <span className="text-xs text-gray-500">%</span>
                </div>
              )}
              {splitType === 'unit' && selectedParticipants.has(p.id) && (
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="number"
                    min="1"
                    max={item.quantity}
                    step="1"
                    value={unitCounts[p.id] ?? ''}
                    onChange={(e) =>
                      setUnitCounts({
                        ...unitCounts,
                        [p.id]: Math.max(0, parseInt(e.target.value, 10) || 0),
                      })
                    }
                    className="w-16 px-2 py-1 border rounded text-sm"
                    placeholder="qty"
                  />
                  <span className="text-xs text-gray-500">units</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {splitType === 'percentage' && selectedParticipants.size > 0 && (
          <p className={`text-sm mb-3 ${Math.abs(totalPercentage - 100) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
            Total: {totalPercentage.toFixed(1)}%
            {Math.abs(totalPercentage - 100) >= 0.01 && ' (must equal 100%)'}
          </p>
        )}

        {splitType === 'unit' && selectedParticipants.size > 0 && (
          <p className={`text-sm mb-3 ${unitsBalanced ? 'text-green-600' : 'text-red-600'}`}>
            Total: {totalUnits} of {item.quantity} unit{item.quantity === 1 ? '' : 's'}
            {!unitsBalanced && ` (must equal ${item.quantity})`}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleSaveAssignment}
            disabled={
              isSaving ||
              selectedParticipants.size === 0 ||
              (splitType === 'percentage' && Math.abs(totalPercentage - 100) >= 0.01) ||
              (splitType === 'unit' && !unitsBalanced)
            }
            className="flex-1 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Assignment'}
          </button>
          <button
            onClick={() => setIsAssigning(false)}
            disabled={isSaving}
            className="px-3 py-2 border rounded hover:bg-gray-100"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4 hover:border-gray-400 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium truncate min-w-0">{item.name}</span>
            {item.quantity > 1 && (
              <span className="text-sm text-gray-500 shrink-0">x{item.quantity}</span>
            )}
          </div>
          <div className="text-base sm:text-lg font-semibold text-gray-800 break-words">
            {formatIDR(item.price * item.quantity)}
            {item.quantity > 1 && (
              <span className="text-sm font-normal text-gray-500 ml-1">
                ({formatIDR(item.price)} each)
              </span>
            )}
          </div>
          {assignedNames ? (
            <p className="text-sm text-green-600 mt-1 break-words">{assignedNames}</p>
          ) : (
            <p className="text-sm text-orange-500 mt-1">Not assigned</p>
          )}
        </div>

        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => setIsAssigning(true)}
            disabled={disabled || participants.length === 0}
            className="p-2 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
            title="Assign to participants"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </button>
          <button
            onClick={() => setIsEditing(true)}
            disabled={disabled}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
            title="Edit item"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={handleDelete}
            disabled={disabled || isDeleting}
            className="p-2 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
            title="Delete item"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
