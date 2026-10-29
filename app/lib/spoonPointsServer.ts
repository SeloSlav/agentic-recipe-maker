import { Timestamp } from './backend/timestamp';
import { serverDb, serverAuth } from "./backend/admin";
import { POINT_ACTIONS } from './spoonPoints';

const db = serverDb;

interface PointTransaction {
  userId: string;
  actionType: string;
  points: number;
  timestamp: Timestamp;
  context?: Record<string, any> | null;
  targetId?: string | null;
  details?: string;
}

function getActionHistory(
  transactions: PointTransaction[],
  actionType: string,
  targetId?: string,
  since?: Date
): PointTransaction[] {
  return transactions.filter((t) => {
    const matchesAction = t.actionType === actionType;
    const matchesTarget = !targetId || t.targetId === targetId;
    const matchesTime = !since || t.timestamp.toDate() > since;
    return matchesAction && matchesTarget && matchesTime;
  });
}

export async function awardPointsServer(
  userId: string,
  actionType: string,
  targetId?: string,
  context?: Record<string, any>
): Promise<{ success: boolean; points?: number; error?: string }> {
  try {
    const action = POINT_ACTIONS[actionType];
    if (!action) return { success: false, error: `Invalid action type: ${actionType}` };

    const userPointsRef = db.collection('spoonPoints').doc(userId);
    const userPointsDoc = await userPointsRef.get();
    const existingTransactions: PointTransaction[] = userPointsDoc.exists
      ? userPointsDoc.data()?.transactions || []
      : [];

    const now = new Date();
    const cooldownDate = new Date(now.getTime() - action.cooldown * 60 * 1000);
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);

    const recentActions = getActionHistory(existingTransactions, action.type, targetId, cooldownDate);
    if (recentActions.length > 0 && action.cooldown > 0) {
      return { success: false, error: 'Action on cooldown' };
    }

    if (action.maxPerDay) {
      const todayActions = getActionHistory(existingTransactions, action.type, undefined, dayStart);
      if (todayActions.length >= action.maxPerDay) {
        return { success: false, error: 'Daily limit reached' };
      }
    }

    if (action.requiresUnique && targetId) {
      const allActions = getActionHistory(existingTransactions, action.type, targetId);
      if (allActions.length > 0) {
        return { success: false, error: 'Action already performed on this target' };
      }
    }

    const points = action.getPoints ? action.getPoints(context) : action.points;

    const transaction: PointTransaction = {
      userId,
      actionType,
      points,
      timestamp: serverDb.Timestamp.now(),
      targetId: targetId || null,
      context: context || null,
      details: action.displayName,
    };

    if (!userPointsDoc.exists) {
      await userPointsRef.set({
        totalPoints: points,
        transactions: [transaction],
      });
    } else {
      await userPointsRef.update({
        totalPoints: serverDb.transforms.increment(points),
        transactions: serverDb.transforms.arrayUnion(transaction),
      });
    }

    return { success: true, points };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('SpoonPoints (server) - Error awarding points:', { error: errorMessage, actionType, userId });
    return { success: false, error: 'Internal error' };
  }
}
