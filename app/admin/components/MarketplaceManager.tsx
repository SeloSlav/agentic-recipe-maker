import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc, addDoc } from '../../lib/backend/database';
import { db } from "../../lib/backend/client";
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { Goodie } from '../../marketplace/types';
import { isAdmin } from '../../config/admin';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpoon } from '@fortawesome/free-solid-svg-icons';

interface EditableGoodie extends Goodie {
    docId: string;
}

interface MarketplaceManagerProps {
    user: any;
    showPointsToast: (points: number, message: string) => void;
}

const MarketplaceManager: React.FC<MarketplaceManagerProps> = ({ user, showPointsToast }) => {
    const [loading, setLoading] = useState(false);
    const [goodies, setGoodies] = useState<EditableGoodie[]>([]);
    const [editingGoodie, setEditingGoodie] = useState<EditableGoodie | null>(null);
    const [generatingAI, setGeneratingAI] = useState(false);

    const getRarityColor = (rarity: string): string => {
        switch (rarity) {
            case 'common':
                return 'bg-gray-100 text-gray-600';
            case 'uncommon':
                return 'bg-green-100 text-green-600';
            case 'rare':
                return 'bg-blue-100 text-blue-600';
            case 'epic':
                return 'bg-purple-100 text-purple-600';
            case 'legendary':
                return 'bg-yellow-100 text-yellow-600';
            default:
                return 'bg-gray-100 text-gray-600';
        }
    };

    // Fetch existing goodies
    useEffect(() => {
        const fetchGoodies = async () => {
            if (!user) return;
            const adminCheck = await isAdmin(user.uid);
            if (!adminCheck) return;

            try {
                const goodiesSnapshot = await getDocs(collection(db, 'goodies'));
                const goodiesData = goodiesSnapshot.docs.map(doc => ({
                    docId: doc.id,
                    ...doc.data()
                })) as EditableGoodie[];
                setGoodies(goodiesData);
            } catch (error) {
                console.error('Error fetching goodies:', error);
                showPointsToast(0, 'Failed to fetch goodies');
            }
        };

        fetchGoodies();
    }, [user, showPointsToast]);

    const handleUpdateGoodie = async (goodie: EditableGoodie) => {
        if (!user) return;
        const adminCheck = await isAdmin(user.uid);
        if (!adminCheck) return;

        try {
            setLoading(true);
            const goodieRef = doc(db, 'goodies', goodie.docId);

            // Remove docId before updating
            const { docId, ...updateData } = goodie;
            await updateDoc(goodieRef, updateData);

            // Update local state
            setGoodies(prev => prev.map(g =>
                g.docId === goodie.docId ? goodie : g
            ));

            showPointsToast(0, `Updated ${goodie.name} successfully!`);
            setEditingGoodie(null);
        } catch (error) {
            console.error('Error updating goodie:', error);
            showPointsToast(0, 'Failed to update goodie');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteGoodie = async (docId: string) => {
        if (!user) return;
        const adminCheck = await isAdmin(user.uid);
        if (!adminCheck) return;

        if (!confirm('Are you sure you want to delete this item?')) return;

        try {
            setLoading(true);
            await deleteDoc(doc(db, 'goodies', docId));
            setGoodies(prev => prev.filter(g => g.docId !== docId));
            showPointsToast(0, 'Item deleted successfully!');
        } catch (error) {
            console.error('Error deleting goodie:', error);
            showPointsToast(0, 'Failed to delete item');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateGoodie = async (goodie: EditableGoodie) => {
        if (!user) return;
        const adminCheck = await isAdmin(user.uid);
        if (!adminCheck) return;

        try {
            setLoading(true);
            // Remove docId before creating
            const { docId, ...createData } = goodie;

            // Add to database
            const goodiesCollection = collection(db, 'goodies');
            const docRef = await addDoc(goodiesCollection, createData);

            // Add to local state with the new docId
            const newGoodie = { ...goodie, docId: docRef.id };
            setGoodies(prev => [...prev, newGoodie]);

            showPointsToast(0, `Created ${goodie.name} successfully!`);
            setEditingGoodie(null);
        } catch (error) {
            console.error('Error creating goodie:', error);
            showPointsToast(0, 'Failed to create goodie');
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateAISuggestion = async () => {
        if (!editingGoodie) return;

        try {
            setGeneratingAI(true);
            const response = await fetch('/api/generateGoodie', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    category: editingGoodie.category,
                    rarity: editingGoodie.rarity,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate suggestion');
            }

            const data = await response.json();

            // Update the form with AI suggestions while keeping the category and rarity
            setEditingGoodie(prev => ({
                ...prev!,
                name: data.name,
                description: data.description,
                cost: data.cost,
                imageUrl: data.imageUrl,
            }));

            showPointsToast(0, 'AI suggestion generated! Review and create if you like it.');
        } catch (error) {
            console.error('Error generating AI suggestion:', error);
            showPointsToast(0, 'Failed to generate AI suggestion');
        } finally {
            setGeneratingAI(false);
        }
    };

    return (
        <div className="bg-white rounded-xl p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold">Discount Code Management</h2>
            </div>

            {/* New Discount Code Form */}
            <div className="mb-8 border-b pb-8">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium">Add New Discount Code</h3>
                    {!editingGoodie?.docId && (
                        <button
                            onClick={() =>                             setEditingGoodie({
                                docId: 'new',
                                name: '',
                                description: '',
                                cost: 0,
                                rarity: 'common',
                                category: 'Olive Oil',
                                imageUrl: '',
                                hidden: false
                            } as EditableGoodie)}
                            className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
                        >
                            Show Form
                        </button>
                    )}
                </div>

                {editingGoodie?.docId === 'new' && (
                    <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                        {/* Category, Rarity, and AI Button */}
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Category</label>
                                <select
                                    value={editingGoodie.category}
                                    onChange={e => setEditingGoodie({
                                        ...editingGoodie,
                                        category: e.target.value as any
                                    })}
                                    className="w-full px-3 py-2 border rounded-lg"
                                >
                                    <option value="Olive Oil">Olive Oil (Discount Code)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Rarity</label>
                                <select
                                    value={editingGoodie.rarity}
                                    onChange={e => setEditingGoodie({
                                        ...editingGoodie,
                                        rarity: e.target.value as any
                                    })}
                                    className="w-full px-3 py-2 border rounded-lg"
                                >
                                    <option value="common">Common</option>
                                    <option value="uncommon">Uncommon</option>
                                    <option value="rare">Rare</option>
                                    <option value="epic">Epic</option>
                                    <option value="legendary">Legendary</option>
                                </select>
                            </div>
                            <div className="flex items-end">
                                <button
                                    onClick={handleGenerateAISuggestion}
                                    disabled={generatingAI}
                                    className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {generatingAI ? (
                                        <>
                                            <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                                            <span>Generating...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span>✨</span>
                                            <span>Get AI Suggestion</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Name and Image URL */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Name</label>
                                <input
                                    type="text"
                                    value={editingGoodie.name}
                                    onChange={e => setEditingGoodie({
                                        ...editingGoodie,
                                        name: e.target.value
                                    })}
                                    className="w-full px-3 py-2 border rounded-lg"
                                    placeholder="Item name..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Image URL</label>
                                <input
                                    type="text"
                                    value={editingGoodie.imageUrl}
                                    onChange={e => setEditingGoodie({
                                        ...editingGoodie,
                                        imageUrl: e.target.value
                                    })}
                                    className="w-full px-3 py-2 border rounded-lg"
                                    placeholder="/marketplace/item.jpg"
                                />
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <label className="block text-sm font-medium mb-1">Description</label>
                            <textarea
                                value={editingGoodie.description}
                                onChange={e => setEditingGoodie({
                                    ...editingGoodie,
                                    description: e.target.value
                                })}
                                className="w-full px-3 py-2 border rounded-lg"
                                rows={3}
                                placeholder="Item description..."
                            />
                        </div>

                        {/* Cost */}
                        <div>
                            <label className="block text-sm font-medium mb-1">Cost (spoons)</label>
                            <input
                                type="number"
                                value={editingGoodie.cost || ''}
                                onChange={e => setEditingGoodie({
                                    ...editingGoodie,
                                    cost: e.target.value === '' ? 0 : parseInt(e.target.value)
                                })}
                                className="w-full px-3 py-2 border rounded-lg"
                                placeholder="0"
                                min="0"
                            />
                        </div>

                        {/* Hidden field */}
                        <div className="flex items-center">
                            <input
                                type="checkbox"
                                id="hiddenCheckbox"
                                checked={editingGoodie.hidden || false}
                                onChange={e => setEditingGoodie({
                                    ...editingGoodie,
                                    hidden: e.target.checked
                                })}
                                className="mr-2 h-4 w-4"
                            />
                            <label htmlFor="hiddenCheckbox" className="text-sm font-medium text-gray-700">
                                Hidden (not visible in marketplace)
                            </label>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                onClick={() => setEditingGoodie(null)}
                                className="px-4 py-2 text-gray-600 hover:text-gray-800"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleCreateGoodie(editingGoodie)}
                                disabled={loading}
                                className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                            >
                                {loading ? <LoadingSpinner /> : 'Create Item'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Existing Items Grid */}
            <div>
                <h3 className="text-lg font-medium mb-4">Current Discount Codes</h3>

                <div className="grid grid-cols-1 gap-4">
                    {goodies
                        .filter(goodie => goodie.category === 'Olive Oil')
                        .sort((a, b) => a.cost - b.cost)
                        .map(goodie => (
                            <div key={goodie.docId} className="border rounded-lg overflow-hidden bg-white shadow-md hover:shadow-lg transition-shadow flex">
                                <div className="relative h-24 w-24 flex-shrink-0 bg-gray-100">
                                    {goodie.imageUrl ? (
                                        <img
                                            src={goodie.imageUrl}
                                            alt={goodie.name}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                const target = e.target as HTMLImageElement;
                                                target.src = '/marketplace/placeholder.png';
                                            }}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                                            <div className="text-center">
                                                <div className="text-2xl">🎁</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 p-4">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h4 className="text-lg font-semibold mb-2">{goodie.name}</h4>
                                            <div className="flex flex-wrap gap-2 mb-2">
                                                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getRarityColor(goodie.rarity)}`}>
                                                    {goodie.rarity.charAt(0).toUpperCase() + goodie.rarity.slice(1)}
                                                </span>
                                                <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-600">
                                                    Discount Code
                                                </span>
                                                {goodie.hidden && (
                                                    <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-600">
                                                        Hidden
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-gray-600 mb-2">{goodie.description}</p>
                                            <div className="flex items-center text-yellow-600">
                                                <span className="mr-2">🥄</span>
                                                <span className="font-bold text-lg">{goodie.cost}</span>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setEditingGoodie(goodie)}
                                                className="p-2 bg-black bg-opacity-50 hover:bg-opacity-75 text-white rounded-lg transition-colors"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDeleteGoodie(goodie.docId)}
                                                className="p-2 bg-red-600 bg-opacity-50 hover:bg-opacity-75 text-white rounded-lg transition-colors"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                </div>
            </div>

            {/* Edit Modal */}
            {editingGoodie && editingGoodie.docId !== 'new' && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <h3 className="text-xl font-semibold mb-4">Edit Item</h3>
                        <div className="space-y-4">
                            {/* Category and Rarity */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Category</label>
                                    <select
                                        value={editingGoodie.category}
                                        onChange={e => setEditingGoodie({
                                            ...editingGoodie,
                                            category: e.target.value as any
                                        })}
                                        className="w-full px-3 py-2 border rounded-lg"
                                    >
                                        <option value="Olive Oil">Olive Oil (Discount Code)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Rarity</label>
                                    <select
                                        value={editingGoodie.rarity}
                                        onChange={e => setEditingGoodie({
                                            ...editingGoodie,
                                            rarity: e.target.value as any
                                        })}
                                        className="w-full px-3 py-2 border rounded-lg"
                                    >
                                        <option value="common">Common</option>
                                        <option value="uncommon">Uncommon</option>
                                        <option value="rare">Rare</option>
                                        <option value="epic">Epic</option>
                                        <option value="legendary">Legendary</option>
                                    </select>
                                </div>
                            </div>

                            {/* Name and Image URL */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Name</label>
                                    <input
                                        type="text"
                                        value={editingGoodie.name}
                                        onChange={e => setEditingGoodie({
                                            ...editingGoodie,
                                            name: e.target.value
                                        })}
                                        className="w-full px-3 py-2 border rounded-lg"
                                        placeholder="Item name..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Image URL</label>
                                    <input
                                        type="text"
                                        value={editingGoodie.imageUrl}
                                        onChange={e => setEditingGoodie({
                                            ...editingGoodie,
                                            imageUrl: e.target.value
                                        })}
                                        className="w-full px-3 py-2 border rounded-lg"
                                        placeholder="/marketplace/item.jpg"
                                    />
                                </div>
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-medium mb-1">Description</label>
                                <textarea
                                    value={editingGoodie.description}
                                    onChange={e => setEditingGoodie({
                                        ...editingGoodie,
                                        description: e.target.value
                                    })}
                                    className="w-full px-3 py-2 border rounded-lg"
                                    rows={3}
                                    placeholder="Item description..."
                                />
                            </div>

                            {/* Cost */}
                            <div>
                                <label className="block text-sm font-medium mb-1">Cost (spoons)</label>
                                <input
                                    type="number"
                                    value={editingGoodie.cost || ''}
                                    onChange={e => setEditingGoodie({
                                        ...editingGoodie,
                                        cost: e.target.value === '' ? 0 : parseInt(e.target.value)
                                    })}
                                    className="w-full px-3 py-2 border rounded-lg"
                                    placeholder="0"
                                    min="0"
                                />
                            </div>

                            {/* Hidden field */}
                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    id="editHiddenCheckbox"
                                    checked={editingGoodie.hidden || false}
                                    onChange={e => setEditingGoodie({
                                        ...editingGoodie,
                                        hidden: e.target.checked
                                    })}
                                    className="mr-2 h-4 w-4"
                                />
                                <label htmlFor="editHiddenCheckbox" className="text-sm font-medium text-gray-700">
                                    Hidden (not visible in marketplace)
                                </label>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    onClick={() => setEditingGoodie(null)}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-800"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleUpdateGoodie(editingGoodie)}
                                    disabled={loading}
                                    className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                                >
                                    {loading ? <LoadingSpinner /> : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MarketplaceManager;