import React from 'react';
import { TransactionRow } from '../../components/SpoonHistoryMenu';
import { Timestamp } from '../../lib/backend/database';

interface PointTransaction {
  actionType: string;
  points: number;
  timestamp: Timestamp;
  details?: string;
  targetId?: string;
}

interface PointsHistoryProps {
  transactions: PointTransaction[];
}

export const PointsHistory: React.FC<PointsHistoryProps> = ({ transactions }) => {
  return (
    <div className="bg-white rounded-3xl shadow-lg border border-amber-100 p-6 shadow-amber-900/5">
      <h2 className="text-xl font-semibold mb-4">Points History</h2>
      <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto overflow-x-hidden pr-2 custom-scrollbar">
        {transactions && transactions.length > 0 ? (
          transactions
            .sort((a, b) => b.timestamp.toDate().getTime() - a.timestamp.toDate().getTime())
            .map((transaction, index) => (
              <TransactionRow
                key={`${transaction.timestamp.toDate().getTime()}-${transaction.actionType}-${transaction.targetId || ''}-${index}`}
                transaction={transaction}
                showDate="long"
                className="border-b border-amber-100"
              />
            ))
        ) : (
          <div className="text-center text-amber-800/70 py-8">
            No points history yet. Start interacting with recipes to earn points!
          </div>
        )}
      </div>
    </div>
  );
};