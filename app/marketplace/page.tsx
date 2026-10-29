"use client";

import React, { useEffect, useState } from 'react';
import { collection, getDocs, doc, updateDoc, arrayUnion, Timestamp, getDoc, setDoc, deleteDoc, addDoc } from '../lib/backend/database';
import { db } from "../lib/backend/client";
import { useAuth } from '../context/AuthContext';
import { Goodie, UserInventoryItem, MarketplaceState } from './types';
import { MarketplaceList } from './components/MarketplaceList';
import { UserInventory } from './components/UserInventory';
import { SpoonPointSystem } from '../lib/spoonPoints';
import { usePoints } from '../context/PointsContext';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { SidebarLayout } from '../components/SidebarLayout';

export default function Marketplace() {
    const [state, setState] = useState<MarketplaceState>({
        goodies: [],
        userInventory: [],
        loading: true,
        error: null
    });
    const { user } = useAuth();
    const { showPointsToast } = usePoints();

    useEffect(() => {
        const fetchMarketplaceData = async () => {
            if (!user) return;

            try {
                // Fetch goodies
                const goodiesSnapshot = await getDocs(collection(db, 'goodies'));
                const goodies = (goodiesSnapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() })) as Goodie[])
                    .filter(g => g.category === 'Olive Oil'); // Only discount codes

                // Fetch user's inventory
                const userInventoryRef = doc(db, `users/${user.uid}/inventory/items`);
                const userInventoryDoc = await getDoc(userInventoryRef);

                let inventory: UserInventoryItem[] = [];

                if (userInventoryDoc.exists()) {
                    inventory = userInventoryDoc.data()?.items || [];
                } else {
                    // Create empty inventory for new users
                    await setDoc(userInventoryRef, { items: [] });
                }

                setState(prev => ({
                    ...prev,
                    goodies,
                    userInventory: inventory,
                    loading: false
                }));
            } catch (error) {
                console.error('Error fetching marketplace data:', error);
                setState(prev => ({
                    ...prev,
                    error: 'Failed to load marketplace data',
                    loading: false
                }));
            }
        };

        fetchMarketplaceData();
    }, [user]);

    const handlePurchase = async (goodie: Goodie) => {
        if (!user) return;

        try {
            // Get current points
            const userPointsRef = doc(db, 'spoonPoints', user.uid);
            const userPointsDoc = await getDoc(userPointsRef);
            const currentPoints = userPointsDoc.data()?.totalPoints || 0;

            // Check if user has enough points
            if (currentPoints < goodie.cost) {
                showPointsToast(
                    0,
                    `Not enough spoons! You need ${goodie.cost} spoons but have ${currentPoints}.`
                );
                return;
            }

            // Attempt to deduct points
            const pointsResult = await SpoonPointSystem.awardPoints(
                user.uid,
                'MARKETPLACE_PURCHASE',
                `purchase-${goodie.id}-${Date.now()}`,
                {
                    cost: -Math.abs(goodie.cost),
                    itemName: goodie.name,
                    rarity: goodie.rarity,
                    details: `Purchased ${goodie.name}`
                }
            );

            if (pointsResult.success) {
                // Prepare the new item
                const purchaseTime = new Date();
                const newItem = {
                    ...goodie,
                    purchasedAt: Timestamp.fromDate(purchaseTime)
                };

                // Get reference to user's inventory document
                const userInventoryRef = doc(db, `users/${user.uid}/inventory/items`);

                try {
                    // Try to update existing inventory
                    await updateDoc(userInventoryRef, {
                        items: arrayUnion(newItem)
                    });
                } catch (error) {
                    // If document doesn't exist, create it
                    if (error.code === 'not-found') {
                        await setDoc(userInventoryRef, {
                            items: [newItem]
                        });
                    } else {
                        throw error; // Re-throw if it's a different error
                    }
                }

                // Update local state
                setState(prev => ({
                    ...prev,
                    userInventory: [
                        { ...goodie, purchasedAt: purchaseTime },
                        ...prev.userInventory
                    ]
                }));

                // Show a special purchase confirmation toast
                const rarityEmoji = {
                    common: '📦',
                    uncommon: '🎁',
                    rare: '✨',
                    epic: '🌟',
                    legendary: '👑'
                }[goodie.rarity] || '🛍️';

                showPointsToast(
                    -goodie.cost,
                    `${rarityEmoji} Purchased ${goodie.name}! (-${goodie.cost} spoons)`
                );
            } else {
                showPointsToast(
                    0,
                    'Not enough spoons to make this purchase!'
                );
            }
        } catch (error) {
            console.error('Error purchasing item:', error);
            showPointsToast(
                0,
                'Failed to complete purchase. Please try again.'
            );
        }
    };

    if (state.loading) {
        return (
            <SidebarLayout>
            <div className="flex flex-col items-center justify-center min-h-screen">
                <LoadingSpinner />
            </div>
            </SidebarLayout>
        );
    }

    if (state.error) {
        return (
            <SidebarLayout>
            <div className="flex flex-col items-center justify-center min-h-screen">
                <div className="text-red-500">{state.error}</div>
            </div>
            </SidebarLayout>
        );
    }

    return (
        <SidebarLayout>
        <div className="min-h-[100vh]">
            <div className="max-w-7xl mx-auto px-4 py-8">
                <div className="flex flex-col items-center mb-12">
                    <img src="/baba-removebg.png" alt="Baba" className="w-32 h-32 mb-4" />
                    <h1 className="text-center text-2xl font-semibold mb-4">Spend your spoons on discount codes!</h1>
                    <p className="text-amber-900/80 text-center">Collect spoons by saving recipes and chatting with Baba, then redeem them for vouchers on premium <a href="https://seloolive.com/products/authentic-croatian-olive-oil?variant=40790542549035" target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:text-amber-700 transition-colors underline">SELO Olive Oil</a>.
                    </p>
                </div>

                {/* Stack inventory above marketplace */}
                <div className="flex flex-col gap-8">
                    {/* Your Discount Codes */}
                    <div className="w-full">
                        <h2 className="text-2xl font-semibold mb-4">Your Discount Codes</h2>
                        <div className="overflow-y-auto pr-2 custom-scrollbar">
                            <UserInventory items={state.userInventory
                                .filter(item => item.category === 'Olive Oil')
                                .sort((a, b) => {
                                const dateA = a.purchasedAt instanceof Timestamp ?
                                    a.purchasedAt.toDate().getTime() :
                                    a.purchasedAt.getTime();
                                const dateB = b.purchasedAt instanceof Timestamp ?
                                    b.purchasedAt.toDate().getTime() :
                                    b.purchasedAt.getTime();
                                return dateB - dateA; // Sort in descending order (newest first)
                            })} />
                        </div>
                    </div>

                    {/* Available Discount Codes */}
                    <div className="w-full">
                        <h2 className="text-2xl font-semibold mb-4">Available Discount Codes</h2>
                        <div className="overflow-y-auto pr-2 custom-scrollbar">
                            <MarketplaceList
                                goodies={state.goodies}
                                onPurchase={handlePurchase}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
        </SidebarLayout>
    );
}