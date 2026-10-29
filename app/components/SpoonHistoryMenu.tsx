import React, { useRef, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpoon, faCheck, faCheckDouble } from "@fortawesome/free-solid-svg-icons";
import { format } from 'date-fns';
import { Timestamp } from '../lib/backend/database';
import Link from 'next/link';
import { POINT_ACTIONS } from '../lib/spoonPoints';

interface PointTransaction {
  actionType: string;
  points: number;
  timestamp: Timestamp;
  details?: string;
  targetId?: string;
  read?: boolean;
}

interface TransactionRowProps {
  transaction: PointTransaction;
  showDate?: 'short' | 'long';
  onTransactionRead?: (uniqueKey: string) => void;
  className?: string;
}

// Function to get emoji for action type
const getActionEmoji = (actionType: string): string => {
  switch (actionType) {
    case 'SAVE_RECIPE':
      return '💾';
    case 'GENERATE_RECIPE':
      return '✨';
    case 'GENERATE_SUMMARY':
      return '📝';
    case 'GENERATE_NUTRITION':
      return '📊';
    case 'GENERATE_PAIRINGS':
      return '🍷';
    case 'GENERATE_TAGS':
      return '🏷️';
    case 'GENERATE_IMAGE':
      return '🎨';
    case 'UPLOAD_IMAGE':
      return '📸';
    case 'CHAT_INTERACTION':
      return '💬';
    case 'RECIPE_SAVED_BY_OTHER':
      return '❤️';
    case 'MARKETPLACE_PURCHASE':
      return '🛍️';
    case 'CAT_VISIT':
      return '🐱';
    default:
      return '🎯';
  }
};

// Shared TransactionRow component
export const TransactionRow: React.FC<TransactionRowProps> = ({
  transaction,
  showDate = 'short',
  onTransactionRead,
  className = ''
}) => {
  const date = transaction.timestamp.toDate();
  const uniqueKey = `${date.getTime()}-${transaction.actionType}-${transaction.targetId || ''}`;

  const renderContent = () => {
    if (transaction.actionType === "CAT_VISIT") {
      return (
        <div
          className="font-medium truncate"
          title={transaction.details || POINT_ACTIONS[transaction.actionType]?.displayName}
        >
          {transaction.details || POINT_ACTIONS[transaction.actionType]?.displayName}
        </div>
      );
    }

    if (['GENERATE_SUMMARY', 'GENERATE_NUTRITION', 'GENERATE_PAIRINGS', 'GENERATE_TAGS', 'GENERATE_IMAGE', 'UPLOAD_IMAGE', 'SAVE_RECIPE'].includes(transaction.actionType) && transaction.targetId) {
      return (
        <Link
          href={`/recipe/${transaction.targetId}`}
          className="font-medium truncate hover:text-blue-600 transition-colors cursor-pointer"
          title={transaction.details || POINT_ACTIONS[transaction.actionType]?.displayName}
        >
          {transaction.details || POINT_ACTIONS[transaction.actionType]?.displayName}
        </Link>
      );
    }

    return (
      <div
        className="font-medium truncate"
        title={transaction.details || POINT_ACTIONS[transaction.actionType]?.displayName}
      >
        {transaction.details || POINT_ACTIONS[transaction.actionType]?.displayName}
      </div>
    );
  };

  return (
    <div className={`flex items-center justify-between p-3 hover:bg-gray-50 transition-colors group relative ${!transaction.read ? 'bg-yellow-50' : ''} ${className}`}>
      <div className="flex items-center flex-1 min-w-0 overflow-hidden">
        <div className="text-xl mr-3 flex-shrink-0" role="img" aria-label={transaction.actionType}>
          {getActionEmoji(transaction.actionType)}
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          {renderContent()}
          <div className="text-xs text-gray-500">
            {format(date, showDate === 'short' ? 'MMM d, h:mm a' : 'MMM d, yyyy h:mm a')}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className={`flex items-center ml-2 flex-shrink-0 ${
          transaction.actionType === 'MARKETPLACE_PURCHASE' ? 'text-red-500' : 'text-yellow-600'
        }`}>
          <FontAwesomeIcon icon={faSpoon} className="mr-1" />
          <span className="font-bold">
            {transaction.actionType === 'MARKETPLACE_PURCHASE'
              ? `-${String(transaction.points).replace(/[^0-9]/g, '')}`
              : `+${String(transaction.points).replace(/[^0-9]/g, '')}`
            }
          </span>
        </div>
        {onTransactionRead && !transaction.read && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTransactionRead(uniqueKey);
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 p-1 hover:bg-gray-100 rounded-full"
            title="Mark as read"
          >
            <FontAwesomeIcon icon={faCheck} className="text-gray-500 w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

interface SpoonHistoryMenuProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: PointTransaction[];
  totalPoints: number;
  onTransactionRead: (transactionId: string) => void;
  onMarkAllRead: () => void;
  unreadCount: number;
}

export const SpoonHistoryMenu: React.FC<SpoonHistoryMenuProps> = ({
  isOpen,
  onClose,
  transactions,
  totalPoints,
  onTransactionRead,
  onMarkAllRead,
  unreadCount
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("click", handleClickOutside);
    }
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="absolute top-full right-0 mt-1 z-40 bg-white rounded-3xl shadow-lg w-80 border border-amber-200/60 overflow-hidden flex flex-col"
      style={{ maxHeight: 'calc(100vh - 5rem)' }}
    >
      {/* Fixed header */}
      <div className="flex-shrink-0 p-4 pb-0">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Recent Activity</h3>
            <p className="text-sm text-gray-500">Track your cooking<br />achievements</p>
          </div>
          <div className="flex items-center text-yellow-600">
            <FontAwesomeIcon icon={faSpoon} className="mr-2" />
            <span className="text-lg font-bold">{totalPoints}</span>
          </div>
        </div>

        {unreadCount > 0 && (
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
            </span>
            <button
              onClick={onMarkAllRead}
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <FontAwesomeIcon icon={faCheckDouble} className="w-3 h-3" />
              <span>Mark all as read</span>
            </button>
          </div>
        )}
      </div>

      <hr className="border-t border-gray-200 mx-4 mt-3 flex-shrink-0" />

      {/* Scrollable content - scrollbar integrated with rounded corners */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden spoon-menu-scrollbar pr-1">
        <div className="space-y-1 py-2">
          {transactions && transactions.length > 0 ? (
            transactions
              .sort((a, b) => b.timestamp.toDate().getTime() - a.timestamp.toDate().getTime())
              .slice(0, 10)
              .map((transaction) => (
                <TransactionRow
                  key={`${transaction.timestamp.toDate().getTime()}-${transaction.actionType}-${transaction.targetId || ''}`}
                  transaction={transaction}
                  onTransactionRead={onTransactionRead}
                  showDate="short"
                />
              ))
          ) : (
            <div className="text-center text-gray-500 py-8 px-4">
              No points history yet. Start interacting with recipes to earn points!
            </div>
          )}
        </div>
      </div>

      {/* Fixed footer */}
      <div className="flex-shrink-0 pt-3 pb-4 px-4 border-t border-gray-200">
        <Link
          href="/spoons"
          className="flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors p-2 rounded-xl hover:bg-amber-50"
        >
          <span>View Full History</span>
          <span className="text-gray-400">→</span>
        </Link>
      </div>
    </div>
  );
};