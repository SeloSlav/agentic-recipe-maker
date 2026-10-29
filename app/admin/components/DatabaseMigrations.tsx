import React, { useState } from 'react';
import { collection, getDocs, doc, updateDoc, writeBatch, query, limit } from '../../lib/backend/database';
import { db } from "../../lib/backend/client";
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { isAdmin } from '../../config/admin';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faChevronRight } from '@fortawesome/free-solid-svg-icons';

interface DatabaseMigrationsProps {
    user: any;
    showPointsToast: (points: number, message: string) => void;
}

const DatabaseMigrations: React.FC<DatabaseMigrationsProps> = ({ user, showPointsToast }) => {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [isOpen, setIsOpen] = useState(true);

    const runDirectionsCountMigration = async () => {
        if (!user) return;
        const adminCheck = await isAdmin(user.uid);
        if (!adminCheck) return;

        if (!confirm(
            'This will:\n\n' +
            '1. Calculate the length of each recipe\'s directions array\n' +
            '2. Set ONLY the directionsCount field to that length\n' +
            '3. Not modify any other fields\n\n' +
            'Are you sure you want to proceed?'
        )) {
            return;
        }

        try {
            setLoading(true);

            // First, get total count for progress tracking
            const recipesSnapshot = await getDocs(collection(db, 'recipes'));
            const totalRecipes = recipesSnapshot.size;
            setProgress({ current: 0, total: totalRecipes });

            // Process in batches of 500 (database batch limit)
            const BATCH_SIZE = 500;
            let processedCount = 0;

            // Get all recipes
            const allRecipes = recipesSnapshot.docs;

            // Process in batches
            for (let i = 0; i < allRecipes.length; i += BATCH_SIZE) {
                const batch = writeBatch(db);
                const batchRecipes = allRecipes.slice(i, i + BATCH_SIZE);

                batchRecipes.forEach(recipeDoc => {
                    const data = recipeDoc.data();
                    const directions = data.directions || [];
                    // Only set the directionsCount field, using merge to not affect other fields
                    batch.set(doc(db, 'recipes', recipeDoc.id), {
                        directionsCount: directions.length
                    }, { merge: true });
                });

                await batch.commit();
                processedCount += batchRecipes.length;
                setProgress({ current: processedCount, total: totalRecipes });
            }

            showPointsToast(0, `Migration complete: Updated directionsCount for ${totalRecipes} recipes`);
        } catch (error) {
            console.error('Error in migration:', error);
            showPointsToast(0, 'Failed to complete migration');
        } finally {
            setLoading(false);
            setProgress({ current: 0, total: 0 });
        }
    };

    return (
        <div className="bg-white rounded-3xl shadow-lg border border-gray-300 overflow-hidden mb-8">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-100 transition-colors"
            >
                <h2 className="text-lg font-medium text-[#5d5d5d]">Database Migrations</h2>
                <FontAwesomeIcon
                    icon={isOpen ? faChevronDown : faChevronRight}
                    className={`text-[#5d5d5d] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>
            <div className={`transition-all duration-200 ${isOpen ? 'block border-t border-gray-300' : 'hidden'}`}>
                <div className="p-6">
                    <div className="space-y-4">
                        <div className="border rounded-lg p-4">
                            <h3 className="font-medium mb-2">Add directionsCount Field</h3>
                            <p className="text-sm text-gray-600 mb-4">
                                This migration adds a directionsCount field to all recipes, which is needed for proper recipe filtering.
                            </p>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={runDirectionsCountMigration}
                                    disabled={loading}
                                    className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {loading ? (
                                        <>
                                            <LoadingSpinner />
                                            <span>Migrating...</span>
                                        </>
                                    ) : (
                                        'Run Migration'
                                    )}
                                </button>
                                {loading && progress.total > 0 && (
                                    <div className="flex-1 space-y-2">
                                        <div className="flex justify-between text-sm text-gray-600">
                                            <span>Progress: {progress.current} / {progress.total} recipes</span>
                                            <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                                            <div
                                                className="bg-black h-2.5 rounded-full transition-all duration-300"
                                                style={{ width: `${(progress.current / progress.total) * 100}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DatabaseMigrations;