"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { collection, query, where, getDocs, getCountFromServer, orderBy, limit, startAfter, doc, updateDoc, arrayUnion, arrayRemove, getDoc, Timestamp, increment, setDoc } from '../lib/backend/database';
import { db } from "../lib/backend/client";
import { Recipe } from '../recipe/types';
import { RecipeCard } from '../components/RecipeCard';
import { RecipeCardSkeleton } from '../components/RecipeCardSkeleton';
import { SearchBar } from '../components/SearchBar';
import { useAuth } from '../context/AuthContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHeart as faHeartSolid } from '@fortawesome/free-solid-svg-icons';
import { faHeart as faHeartRegular } from '@fortawesome/free-regular-svg-icons';
import { faPen, faUser, faCamera } from '@fortawesome/free-solid-svg-icons';
import Image from 'next/image';

interface UserProfileClientProps {
    userId: string;
    username: string;
}

interface RecipeDocumentData {
    recipeTitle?: string;
    recipeContent?: string;
    cuisineType?: string;
    cookingDifficulty?: string;
    cookingTime?: string;
    diet?: string[];
    directions?: string[];
    ingredients?: string[];
    imageURL?: string;
    recipeSummary?: string;
    recipeNotes?: string;
    macroInfo?: {
        servings: number;
        total: {
            calories: number;
            proteins: number;
            carbs: number;
            fats: number;
        };
        per_serving: {
            calories: number;
            proteins: number;
            carbs: number;
            fats: number;
        };
    };
    dishPairings?: string;
    pinned?: boolean;
    lastPinnedAt?: any;
    userId?: string;
    likes?: string[];
    createdAt?: any;
}

const POINTS_FOR_LIKE = 50; // Points awarded when someone likes your recipe

export default function UserProfileClient({ userId, username }: UserProfileClientProps) {
    const { user } = useAuth();
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [filteredRecipes, setFilteredRecipes] = useState<Recipe[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastVisible, setLastVisible] = useState<any>(null);
    const [hasMore, setHasMore] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [totalRecipes, setTotalRecipes] = useState(0);
    const [likeLoading, setLikeLoading] = useState<string | null>(null);
    const observerRef = useRef<IntersectionObserver | null>(null);
    const [userBio, setUserBio] = useState<string>("");
    const [isEditingBio, setIsEditingBio] = useState(false);
    const [editedBio, setEditedBio] = useState("");
    const [savingBio, setSavingBio] = useState(false);
    const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [currentUsername, setCurrentUsername] = useState<string>("");
    const stateBeforeSearchRef = useRef<{ recipes: Recipe[]; lastVisible: any; hasMore: boolean } | null>(null);
    const prevSearchTermRef = useRef("");

    const RECIPES_PER_PAGE = 12;

    const pinnedRecipes = React.useMemo(
        () => filteredRecipes.filter((r) => r.pinned),
        [filteredRecipes]
    );
    const unpinnedRecipes = React.useMemo(
        () => filteredRecipes.filter((r) => !r.pinned),
        [filteredRecipes]
    );

    const searchRecipes = async (searchTerms: string[]) => {
        setIsSearching(true);

        try {
            const recipesRef = collection(db, "recipes");
            let searchQuery = query(
                recipesRef,
                where("userId", "==", userId),
                orderBy("createdAt", "desc")
            );

            // Get all matching documents
            const querySnapshot = await getDocs(searchQuery);
            const allRecipes = querySnapshot.docs.map((doc) => {
                const data = doc.data() as RecipeDocumentData;
                return {
                    id: doc.id,
                    ...data,
                    likes: Array.isArray(data.likes) ? data.likes : [],
                    pinned: Boolean(data.pinned),
                    createdAt: data.createdAt?.toDate() || new Date(),
                    username: username
                } as Recipe;
            });

            // Client-side filtering for complex search
            const filtered = allRecipes.filter((recipe) => {
                // Ensure arrays are properly handled
                const diets = Array.isArray(recipe.diet) ? recipe.diet : [];
                const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];

                const searchableFields = [
                    recipe.recipeTitle?.toLowerCase() || "",
                    recipe.cuisineType?.toLowerCase() || "",
                    recipe.cookingDifficulty?.toLowerCase() || "",
                    recipe.cookingTime?.toLowerCase() || "",
                    recipe.recipeSummary?.toLowerCase() || "",
                    ...diets.map(d => d.toLowerCase()),
                    ...ingredients.map(i => i.toLowerCase()),
                ].filter(Boolean); // Remove any undefined/null values

                return searchTerms.every((term) =>
                    searchableFields.some((field) => field.includes(term))
                );
            });

            setRecipes(filtered);
            setFilteredRecipes(filtered);
            setHasMore(false); // Disable pagination during search
        } catch (error) {
            console.error("Error searching recipes:", error);
        } finally {
            setIsSearching(false);
        }
    };

    const fetchRecipes = async (loadMore = false) => {
        if (loadMore) {
            setLoadingMore(true);
        } else {
            setLoading(true);
        }

        try {
            // Get user bio
            const userDoc = await getDoc(doc(db, "users", userId));
            if (userDoc.exists()) {
                setUserBio(userDoc.data().bio || "");
                setProfilePhoto(userDoc.data().profilePhoto || null);
            }

            const recipesRef = collection(db, "recipes");
            const recipesQuery = loadMore && lastVisible
                ? query(
                    recipesRef,
                    where("userId", "==", userId),
                    orderBy("createdAt", "desc"),
                    startAfter(lastVisible),
                    limit(RECIPES_PER_PAGE)
                )
                : query(
                    recipesRef,
                    where("userId", "==", userId),
                    orderBy("createdAt", "desc"),
                    limit(RECIPES_PER_PAGE)
                );

            const totalQuery = query(recipesRef, where("userId", "==", userId));
            const [countSnapshot, querySnapshot] = await Promise.all([
                getCountFromServer(totalQuery),
                getDocs(recipesQuery)
            ]);
            setTotalRecipes(countSnapshot.data().count);
            const fetchedRecipes = querySnapshot.docs.map(doc => {
                const data = doc.data() as RecipeDocumentData;
                return {
                    id: doc.id,
                    ...data,
                    likes: Array.isArray(data.likes) ? data.likes : [],
                    pinned: Boolean(data.pinned),
                    createdAt: data.createdAt?.toDate() || new Date(),
                    username: username
                } as Recipe;
            });

            // Update lastVisible for pagination
            const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
            setLastVisible(lastDoc);

            // Update both recipes states
            if (loadMore) {
                const newRecipes = [...recipes, ...fetchedRecipes];
                setRecipes(newRecipes);
                setFilteredRecipes(newRecipes);
            } else {
                setRecipes(fetchedRecipes);
                setFilteredRecipes(fetchedRecipes);
            }

            // Check if there are more recipes to load
            setHasMore(querySnapshot.docs.length === RECIPES_PER_PAGE);
        } catch (error) {
            console.error('Error fetching recipes:', error);
            setError('Failed to load recipes');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    // Infinite scroll observer
    const lastRecipeRef = useCallback((node: HTMLDivElement | null) => {
        if (loadingMore) return;
        if (observerRef.current) observerRef.current.disconnect();

        observerRef.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore && !isSearching) {
                fetchRecipes(true);
            }
        });

        if (node) observerRef.current.observe(node);
    }, [loadingMore, hasMore, isSearching]);

    // Reset search state when switching users
    useEffect(() => {
        stateBeforeSearchRef.current = null;
        prevSearchTermRef.current = "";
        setSearchTerm("");
    }, [userId]);

    // Search effect with debounce - also handles initial fetch when no search
    useEffect(() => {
        const trimmed = searchTerm.trim();
        if (!trimmed) {
            if (stateBeforeSearchRef.current) {
                setRecipes(stateBeforeSearchRef.current.recipes);
                setFilteredRecipes(stateBeforeSearchRef.current.recipes);
                setLastVisible(stateBeforeSearchRef.current.lastVisible);
                setHasMore(stateBeforeSearchRef.current.hasMore);
                stateBeforeSearchRef.current = null;
            } else {
                fetchRecipes();
            }
            prevSearchTermRef.current = "";
            return;
        }

        const delayDebounceFn = setTimeout(() => {
            if (prevSearchTermRef.current === "" && recipes.length > 0) {
                stateBeforeSearchRef.current = {
                    recipes: [...recipes],
                    lastVisible,
                    hasMore,
                };
            }
            prevSearchTermRef.current = trimmed;
            const searchTerms = trimmed.toLowerCase().split(" ");
            searchRecipes(searchTerms);
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [searchTerm, userId]);

    // Add effect to fetch current user's username
    useEffect(() => {
        const fetchCurrentUsername = async () => {
            if (user) {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists()) {
                    setCurrentUsername(userDoc.data().username || "");
                }
            }
        };
        fetchCurrentUsername();
    }, [user]);

    const handleLike = async (recipeId: string, currentLikes: string[]) => {
        if (!user) return;

        setLikeLoading(recipeId);
        try {
            const recipeRef = doc(db, 'recipes', recipeId);
            const isLiked = currentLikes.includes(user.uid);

            // If already liked, do nothing
            if (isLiked) {
                return;
            }

            // Like (one-way action)
            await updateDoc(recipeRef, {
                likes: arrayUnion(user.uid)
            });

            // Update local state
            setRecipes(prev => prev.map(recipe => {
                if (recipe.id === recipeId) {
                    return { ...recipe, likes: [...recipe.likes, user.uid] };
                }
                return recipe;
            }));

            setFilteredRecipes(prev => prev.map(recipe => {
                if (recipe.id === recipeId) {
                    return { ...recipe, likes: [...recipe.likes, user.uid] };
                }
                return recipe;
            }));

            // Award points to recipe owner if it's not their own recipe
            if (userId !== user.uid) {
                const spoonRef = doc(db, "spoonPoints", userId);
                const transaction = {
                    actionType: "RECIPE_SAVED_BY_OTHER",
                    points: POINTS_FOR_LIKE,
                    timestamp: Timestamp.now(),
                    targetId: recipeId,
                    details: `Recipe liked by @${currentUsername}`
                };

                try {
                    // Try to update first
                    await updateDoc(spoonRef, {
                        totalPoints: increment(POINTS_FOR_LIKE),
                        transactions: arrayUnion(transaction)
                    });
                } catch (error: any) {
                    // If document doesn't exist, create it
                    if (error.code === 'not-found') {
                        await setDoc(spoonRef, {
                            userId,
                            username,
                            totalPoints: POINTS_FOR_LIKE,
                            transactions: [transaction]
                        });
                    } else {
                        throw error; // Re-throw if it's a different error
                    }
                }
            }
        } catch (error) {
            console.error('Error updating like:', error);
        } finally {
            setLikeLoading(null);
        }
    };

    const handleBioSubmit = async () => {
        if (!user || user.uid !== userId) return;

        const trimmedBio = editedBio.trim();
        if (trimmedBio.length > 500) {
            setError('Bio cannot exceed 500 characters');
            return;
        }

        setSavingBio(true);
        try {
            const userRef = doc(db, "users", userId);
            await updateDoc(userRef, {
                bio: trimmedBio
            });
            setUserBio(trimmedBio);
            setIsEditingBio(false);
            setError(null);
        } catch (error) {
            console.error('Error updating bio:', error);
            setError('Failed to update bio');
        } finally {
            setSavingBio(false);
        }
    };

    const handleProfilePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!user || user.uid !== userId || !e.target.files?.[0]) return;

        const file = e.target.files[0];
        if (!file.type.startsWith('image/')) {
            setError('Please upload an image file');
            return;
        }

        setUploadingPhoto(true);
        try {
            // Create a FormData object to send the file
            const formData = new FormData();
            formData.append('file', file);
            formData.append('userId', userId);

            // Send to your API endpoint
            const response = await fetch('/api/uploadProfilePhoto', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Failed to upload photo');
            }

            const data = await response.json();

            // Update database with the new photo URL
            const userRef = doc(db, "users", userId);
            await updateDoc(userRef, {
                profilePhoto: data.photoUrl
            });

            setProfilePhoto(data.photoUrl);
        } catch (error) {
            console.error('Error uploading photo:', error);
            setError('Failed to upload photo');
        } finally {
            setUploadingPhoto(false);
        }
    };

    if (loading) {
        return (
            <div className="max-w-7xl mx-auto px-4 py-8 min-h-screen bg-[var(--background)]">
                {/* Skeleton: show structure immediately - feels ~40% faster (perceived performance) */}
                <div className="sticky top-0 bg-amber-50/95 backdrop-blur-sm z-10 py-4 -mx-4 px-4 shadow-sm border-b border-amber-100 mb-8">
                    <div className="flex items-start gap-4 mb-4">
                        <div className="w-16 h-16 rounded-full bg-amber-100 animate-pulse" />
                        <div className="flex-1 space-y-2">
                            <div className="h-8 bg-amber-100 rounded w-48 animate-pulse" />
                            <div className="h-4 bg-amber-100/80 rounded w-full max-w-sm animate-pulse" />
                        </div>
                    </div>
                    <div className="h-12 bg-amber-100/60 rounded-xl animate-pulse" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                        <RecipeCardSkeleton key={n} />
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen">
                <div className="text-red-500">{error}</div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            {/* Sticky header */}
            <div className="sticky top-0 bg-amber-50/95 backdrop-blur-sm z-10 py-4 -mx-4 px-4 shadow-sm border-b border-amber-100 mb-8">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-start gap-4 mb-4">
                        <div className="relative group">
                            <div
                                role={user?.uid === userId ? 'button' : undefined}
                                tabIndex={user?.uid === userId ? 0 : undefined}
                                onClick={() => user?.uid === userId && fileInputRef.current?.click()}
                                onKeyDown={(e) => {
                                    if (user?.uid === userId && (e.key === 'Enter' || e.key === ' ')) {
                                        e.preventDefault();
                                        fileInputRef.current?.click();
                                    }
                                }}
                                className={`relative w-16 h-16 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center transition-all duration-300 ease-out ${user?.uid === userId ? 'cursor-pointer hover:ring-2 hover:ring-offset-2 hover:ring-black/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black/30' : ''}`}
                                aria-label={user?.uid === userId ? 'Upload profile photo' : undefined}
                            >
                                {profilePhoto ? (
                                    <Image
                                        src={profilePhoto}
                                        alt={`${username}'s profile`}
                                        width={64}
                                        height={64}
                                        className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-105"
                                    />
                                ) : (
                                    <FontAwesomeIcon
                                        icon={faUser}
                                        className="text-gray-400 text-2xl transition-transform duration-300 group-hover:scale-110"
                                    />
                                )}
                                {user?.uid === userId && (
                                    <div className={`absolute inset-0 rounded-full bg-black/50 flex items-center justify-center transition-opacity duration-300 ${uploadingPhoto ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                        {uploadingPhoto ? (
                                            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <FontAwesomeIcon icon={faCamera} className="text-white text-lg drop-shadow-sm" />
                                        )}
                                    </div>
                                )}
                            </div>
                            {user?.uid === userId && (
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleProfilePhotoUpload}
                                    className="hidden"
                                />
                            )}
                        </div>
                        <div className="flex-1">
                            <h1 className="text-3xl font-bold mb-2">{username}'s Recipes</h1>
                            {userBio || user?.uid === userId ? (
                                <div className="relative group">
                                    {isEditingBio ? (
                                        <div className="flex flex-col gap-2 mb-4">
                                            <textarea
                                                value={editedBio}
                                                onChange={(e) => setEditedBio(e.target.value)}
                                                placeholder="Add a bio..."
                                                className="w-full p-2 text-sm text-amber-900 bg-amber-50/50 border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
                                                rows={2}
                                                maxLength={500}
                                            />
                                            <div className="flex items-center justify-between">
                                                <div className="text-xs text-gray-500">
                                                    {editedBio.length}/500 characters
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={handleBioSubmit}
                                                        disabled={savingBio}
                                                        className="px-3 py-1 text-xs bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:bg-amber-300"
                                                    >
                                                        {savingBio ? (
                                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                        ) : (
                                                            'Save'
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setIsEditingBio(false);
                                                            setEditedBio(userBio);
                                                            setError(null);
                                                        }}
                                                        className="px-3 py-1 text-xs bg-amber-50 text-amber-800 rounded-lg hover:bg-amber-100 transition-colors"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                            {error && (
                                                <div className="text-xs text-red-500">{error}</div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="relative">
                                            <p className="text-gray-600 mb-4 text-sm pr-8">
                                                {userBio || (user?.uid === userId ? "Add a bio..." : "")}
                                            </p>
                                            {user?.uid === userId && (
                                                <button
                                                    onClick={() => {
                                                        setIsEditingBio(true);
                                                        setEditedBio(userBio);
                                                    }}
                                                    className="absolute top-0 right-0 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-gray-600 transition-all duration-200"
                                                    aria-label="Edit bio"
                                                >
                                                    <FontAwesomeIcon icon={faPen} className="text-sm" />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    </div>
                    <SearchBar
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        isLoading={isSearching}
                        resultCount={filteredRecipes.length}
                        totalCount={totalRecipes}
                        placeholder={`Search ${username}'s recipes...`}
                    />
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                        <RecipeCardSkeleton key={n} />
                    ))}
                </div>
            ) : filteredRecipes.length > 0 ? (
                <>
                    {/* Pinned Recipes */}
                    {pinnedRecipes.length > 0 && (
                        <>
                            <h2 className="text-amber-900/80 text-sm font-semibold pb-2 border-b border-amber-100 mb-4">
                                📌 Pinned Recipes
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                                {pinnedRecipes.map((recipe, index) => (
                                    <div key={recipe.id} className="relative group">
                                        <RecipeCard
                                            recipe={recipe}
                                            onLike={() => handleLike(recipe.id, recipe.likes)}
                                            currentUser={user}
                                            showUsername={false}
                                            priority={index < 6}
                                        />
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* All Recipes */}
                    <h2 className="text-amber-900/80 text-sm font-semibold pb-2 border-b border-amber-100 mb-4">
                        🍳 All Recipes
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {unpinnedRecipes.map((recipe, index) => (
                            <div
                                key={recipe.id}
                                ref={index === unpinnedRecipes.length - 1 ? lastRecipeRef : null}
                                className="relative group"
                            >
                                <RecipeCard
                                    recipe={recipe}
                                    onLike={() => handleLike(recipe.id, recipe.likes)}
                                    currentUser={user}
                                    showUsername={false}
                                    priority={index < 6}
                                />
                            </div>
                        ))}
                        {loadingMore && [1, 2, 3].map((n) => (
                            <RecipeCardSkeleton key={`skeleton-${n}`} />
                        ))}
                    </div>

                    {/* Infinite scroll trigger */}
                    {!searchTerm && hasMore && (
                        <div
                            ref={lastRecipeRef}
                            className="h-20 flex items-center justify-center mt-8"
                            style={{ minHeight: '100px' }}
                        >
                            <div className="w-full h-full" />
                        </div>
                    )}
                </>
            ) : (
                <div className="text-center py-12">
                    <div className="text-4xl mb-4">🤔</div>
                    <h3 className="text-xl font-semibold mb-2">No recipes found</h3>
                    <p className="text-amber-800/70">
                        Try adjusting your search or check back later for new recipes
                    </p>
                </div>
            )}
        </div>
    );
}