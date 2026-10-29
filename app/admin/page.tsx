"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
import { usePoints } from '../context/PointsContext';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useRouter } from 'next/navigation';
import RecipeModernizer from './components/RecipeModernizer';
import MarketplaceManager from './components/MarketplaceManager';
import PointsManager from './components/PointsManager';
import DatabaseMigrations from './components/DatabaseMigrations';
import { isAdmin } from '../config/admin';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faChevronRight } from '@fortawesome/free-solid-svg-icons';

interface CollapsibleSectionProps {
    title: string;
    isOpen: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, isOpen, onToggle, children }) => (
    <div className="bg-white rounded-3xl shadow-lg border border-gray-300 overflow-hidden mb-8">
        <button
            onClick={onToggle}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-100 transition-colors"
        >
            <h2 className="text-lg font-medium text-[#5d5d5d]">{title}</h2>
            <FontAwesomeIcon
                icon={isOpen ? faChevronDown : faChevronRight}
                className={`text-[#5d5d5d] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            />
        </button>
        <div className={`transition-all duration-200 ${isOpen ? 'block border-t border-gray-300' : 'hidden'}`}>
            {children}
        </div>
    </div>
);

export default function AdminPage() {
    const [initializing, setInitializing] = useState(true);
    const [authLoading, setAuthLoading] = useState(true);
    const { user } = useAuth();
    const { showPointsToast } = usePoints();
    const router = useRouter();
    const [isUserAdmin, setIsUserAdmin] = useState(false);

    // Add state for each section's collapse state
    const [isRecipeModernizerOpen, setIsRecipeModernizerOpen] = useState(false);
    const [isMarketplaceOpen, setIsMarketplaceOpen] = useState(false);
    const [isPointsManagerOpen, setIsPointsManagerOpen] = useState(false);

    // First, wait for auth to initialize
    useEffect(() => {
        const checkAuth = async () => {
            await new Promise(resolve => setTimeout(resolve, 1000));
            setAuthLoading(false);
        };
        checkAuth();
    }, []);

    // Then check admin status
    useEffect(() => {
        if (authLoading) {
            console.log('Waiting for auth to initialize...');
            return;
        }

        const checkAdmin = async () => {
            console.log('=== Admin Check Debug ===');
            console.log('Auth initialized, user:', user);
            console.log('User UID:', user?.uid);

            if (!user) {
                console.log('No user found');
                showPointsToast(0, "Access denied: Please log in");
                router.push('/');
                setInitializing(false);
                return;
            }

            try {
                const adminCheck = await isAdmin(user.uid);
                console.log('Admin check result:', adminCheck);

                if (!adminCheck) {
                    console.log('User is not admin');
                    console.log('Your UID:', user.uid);
                    showPointsToast(0, "Access denied: Admin privileges required");
                    router.push('/');
                }

                setInitializing(false);
                setIsUserAdmin(adminCheck);
            } catch (error) {
                console.error('Error checking admin status:', error);
                setInitializing(false);
                showPointsToast(0, "Error checking admin status");
                router.push('/');
            }
        };

        checkAdmin();
    }, [user, router, showPointsToast, authLoading]);

    // Show loading state while checking authentication
    if (initializing || authLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen">
                <LoadingSpinner />
                <p className="mt-4 text-gray-600">
                    {authLoading ? 'Initializing authentication...' : 'Checking admin status...'}
                </p>
            </div>
        );
    }

    // If not user or not admin, don't render anything
    if (!user || !isUserAdmin) {
        return null;
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>
            <Link href="/admin/ai" className="block mb-8 rounded-3xl border border-amber-200 bg-amber-50 p-6 hover:bg-amber-100 transition-colors">
                <h2 className="text-xl font-semibold text-amber-950">AI architecture &rarr;</h2>
                <p className="mt-2 text-amber-900">Explore the LangGraph chat and recipe flows, LangChain tools, models, and backend status.</p>
            </Link>

            <DatabaseMigrations user={user} showPointsToast={showPointsToast} />

            <CollapsibleSection
                title="Recipe Modernizer"
                isOpen={isRecipeModernizerOpen}
                onToggle={() => setIsRecipeModernizerOpen(!isRecipeModernizerOpen)}
            >
                <RecipeModernizer showPointsToast={showPointsToast} />
            </CollapsibleSection>

            <CollapsibleSection
                title="Marketplace Management"
                isOpen={isMarketplaceOpen}
                onToggle={() => setIsMarketplaceOpen(!isMarketplaceOpen)}
            >
                <MarketplaceManager user={user} showPointsToast={showPointsToast} />
            </CollapsibleSection>

            <CollapsibleSection
                title="Points Management"
                isOpen={isPointsManagerOpen}
                onToggle={() => setIsPointsManagerOpen(!isPointsManagerOpen)}
            >
                <PointsManager user={user} showPointsToast={showPointsToast} />
            </CollapsibleSection>

        </div>
    );
}
