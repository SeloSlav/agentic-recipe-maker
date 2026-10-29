import React, { useState } from 'react';
import { collection, getDocs, doc, updateDoc, query, where } from '../../lib/backend/database';
import { db } from "../../lib/backend/client";
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { isAdmin } from '../../config/admin';

interface PointsManagerProps {
    user: any;
    showPointsToast: (points: number, message: string) => void;
}

const PointsManager: React.FC<PointsManagerProps> = ({ user, showPointsToast }) => {
    const [ownPointsInput, setOwnPointsInput] = useState<string>('');
    const [userPointsInput, setUserPointsInput] = useState<string>('');
    const [username, setUsername] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSetOwnPoints = async () => {
        if (!user) return;
        const adminCheck = await isAdmin(user.uid);
        if (!adminCheck) return;

        const value = parseInt(ownPointsInput);
        if (!isNaN(value)) {
            const userPointsRef = doc(db, 'spoonPoints', user.uid);
            await updateDoc(userPointsRef, {
                totalPoints: value
            });
            showPointsToast(0, `Your points set to ${value}`);
            setOwnPointsInput(''); // Clear input after setting
        }
    };

    const handleSetUserPoints = async () => {
        if (!user) return;
        const adminCheck = await isAdmin(user.uid);
        if (!adminCheck) return;

        try {
            setLoading(true);
            setError(null);

            // First find the user by username
            const usersQuery = query(
                collection(db, 'users'),
                where('username', '==', username)
            );
            const userSnapshot = await getDocs(usersQuery);

            if (userSnapshot.empty) {
                setError('User not found');
                return;
            }

            const targetUser = userSnapshot.docs[0];
            const value = parseInt(userPointsInput);

            if (isNaN(value)) {
                setError('Please enter a valid number');
                return;
            }

            // Update the user's points
            const userPointsRef = doc(db, 'spoonPoints', targetUser.id);
            await updateDoc(userPointsRef, {
                totalPoints: value
            });

            showPointsToast(0, `Set ${username}'s points to ${value}`);
            setUserPointsInput('');
            setUsername('');
        } catch (error) {
            console.error('Error setting user points:', error);
            setError('Failed to set user points');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-xl p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">Points Management</h2>

            {/* Set Own Points */}
            <div className="mb-8">
                <h3 className="text-lg font-medium mb-4">Set Your Points</h3>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        value={ownPointsInput}
                        onChange={(e) => setOwnPointsInput(e.target.value)}
                        placeholder="Set points..."
                        className="px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                        onClick={handleSetOwnPoints}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                    >
                        Set Points
                    </button>
                </div>
            </div>

            {/* Set User Points */}
            <div>
                <h3 className="text-lg font-medium mb-4">Set User Points</h3>
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Username..."
                            className="px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <input
                            type="number"
                            value={userPointsInput}
                            onChange={(e) => setUserPointsInput(e.target.value)}
                            placeholder="Set points..."
                            className="px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <button
                            onClick={handleSetUserPoints}
                            disabled={loading}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                        >
                            {loading ? <LoadingSpinner /> : 'Set User Points'}
                        </button>
                    </div>
                    {error && (
                        <div className="text-red-500 text-sm">{error}</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PointsManager;