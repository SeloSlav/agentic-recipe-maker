"use client";

import { useEffect, useState, useRef } from "react";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
  doc,
  updateDoc,
  deleteDoc,
  where,
} from "../lib/backend/database";
import { db } from "../lib/backend/client";
import Link from "next/link";
import Image from "next/image";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faXmark, faEllipsisVertical, faThumbtack, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { getAuth } from "../lib/backend/auth";
import { useDeleteRecipe } from "../context/DeleteRecipeContext";
import { SearchBar } from '../components/SearchBar';
import { RecipeCardSkeleton } from '../components/RecipeCardSkeleton';
import { RecipeCard } from '../components/RecipeCard';
import { getExploreFilterUrl } from '../components/FilterTag';
import { SidebarLayout } from '../components/SidebarLayout';
import { Recipe } from '../recipe/types';

// Add type for database document data
interface RecipeDocument {
  recipeTitle: string;
  recipeContent: string;
  cuisineType: string;
  cookingDifficulty: string;
  cookingTime: string;
  diet: string[];
  directions: string[];
  ingredients: string[];
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
  lastPinnedAt?: string;
  userId: string;
  likes?: string[];
  createdAt: any;
}

const QUICK_FILTERS = {
  cuisine: ['Italian', 'Mexican', 'Japanese', 'Indian', 'Mediterranean', 'Balkan', 'Bulgarian', 'Croatian', 'Eastern European', 'Middle Eastern', 'Costa Rican'],
  time: ['15 min', '30 min', '45 min', '1 hour'],
  diet: ['Vegetarian', 'Vegan', 'Pescetarian', 'Omnivore', 'Gluten-free', 'Keto'],
  difficulty: ['Easy', 'Medium', 'Hard'],
} as const;

const Recipes = () => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [filteredRecipes, setFilteredRecipes] = useState<Recipe[]>([]);
  const [totalRecipes, setTotalRecipes] = useState(0);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [loadingPinAction, setLoadingPinAction] = useState<string | null>(null);
  const [loadingDeleteAction, setLoadingDeleteAction] = useState<string | null>(null);
  const auth = getAuth();
  const { showDeletePopup } = useDeleteRecipe();
  const user = auth.currentUser;
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const RECIPES_PER_PAGE = 12;

  // Split recipes into pinned and unpinned
  const pinnedRecipes = filteredRecipes.filter(recipe => recipe.pinned);
  const unpinnedRecipes = filteredRecipes.filter(recipe => !recipe.pinned);

  const handlePinToggle = async (recipeId: string, currentPinned: boolean) => {
    try {
      setLoadingPinAction(recipeId);
      const recipeRef = doc(db, "recipes", recipeId);
      await updateDoc(recipeRef, {
        pinned: !currentPinned
      });

      // Update local state
      const updatedRecipes = recipes.map(recipe =>
        recipe.id === recipeId ? { ...recipe, pinned: !currentPinned } : recipe
      );
      setRecipes(updatedRecipes);
      setFilteredRecipes(updatedRecipes);
      setMenuOpen(null);
    } catch (error) {
      console.error("Error toggling pin:", error);
    } finally {
      setLoadingPinAction(null);
    }
  };

  const handleDelete = async (recipeId: string, recipeTitle: string) => {
    showDeletePopup(recipeId, recipeTitle, async () => {
      try {
        setLoadingDeleteAction(recipeId);
        await deleteDoc(doc(db, "recipes", recipeId));
        const updatedRecipes = recipes.filter(recipe => recipe.id !== recipeId);
        setRecipes(updatedRecipes);
        setFilteredRecipes(updatedRecipes);
        setMenuOpen(null);
      } catch (error) {
        console.error("Error deleting recipe:", error);
      } finally {
        setLoadingDeleteAction(null);
      }
    });
  };

  // Add debounced search function
  const searchRecipes = async (searchTerms: string[]) => {
    if (!user) return;
    setIsSearching(true);

    try {
      const recipesRef = collection(db, "recipes");
      let searchQuery = query(
        recipesRef,
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
      );

      // Get all matching documents
      const querySnapshot = await getDocs(searchQuery);
      const allRecipes = querySnapshot.docs.map((doc) => {
        const data = doc.data() as RecipeDocument;
        return {
          id: doc.id,
          ...data,
          pinned: data.pinned || false,
          userId: data.userId || "",
        };
      }) as Recipe[];

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

  // Update search functionality with debounce
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (!searchTerm.trim()) {
        fetchRecipes(); // Reset to paginated view
        return;
      }

      const searchTerms = searchTerm.toLowerCase().split(" ");
      searchRecipes(searchTerms);
    }, 300); // 300ms delay

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  const fetchRecipes = async (loadMore = false) => {
    if (!user) return;

    if (loadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      // First get total count
      const totalQuery = query(
        collection(db, "recipes"),
        where("userId", "==", user.uid)
      );
      const totalSnapshot = await getDocs(totalQuery);
      setTotalRecipes(totalSnapshot.size);

      // Then get paginated results
      const recipesRef = collection(db, "recipes");
      let recipesQuery;

      if (loadMore && lastVisible) {
        recipesQuery = query(
          recipesRef,
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc"),
          startAfter(lastVisible),
          limit(RECIPES_PER_PAGE)
        );
      } else {
        recipesQuery = query(
          recipesRef,
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc"),
          limit(RECIPES_PER_PAGE)
        );
      }

      const querySnapshot = await getDocs(recipesQuery);
      const fetchedRecipes = querySnapshot.docs.map((doc) => {
        const data = doc.data() as RecipeDocument;
        return {
          id: doc.id,
          ...data,
          pinned: data.pinned || false,
          userId: data.userId || "",
        };
      }) as Recipe[];

      // Update lastVisible for pagination
      const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
      setLastVisible(lastDoc);
      setHasMore(querySnapshot.docs.length === RECIPES_PER_PAGE);

      if (loadMore) {
        const newRecipes = [...recipes, ...fetchedRecipes];
        setRecipes(newRecipes);
        setFilteredRecipes(newRecipes);
      } else {
        setRecipes(fetchedRecipes);
        setFilteredRecipes(fetchedRecipes);
      }
    } catch (error) {
      console.error("Error fetching recipes:", error);
    }

    if (loadMore) {
      setLoadingMore(false);
    } else {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecipes(); // Initial fetch
  }, []);

  // Add intersection observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && hasMore && !loadingMore && !searchTerm) {
          fetchRecipes(true);
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasMore, loadingMore, searchTerm, fetchRecipes]);

  // Add click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 1) Show the loading indicator if we are loading AND have no recipes yet.
  if (loading && recipes.length === 0) {
    return (
      <SidebarLayout>
      <div className="max-w-7xl mx-auto px-4 py-8 min-h-screen bg-[var(--background)]">
        <div className="sticky top-0 bg-amber-50/95 backdrop-blur-sm z-10 py-4 -mx-4 px-4 shadow-sm border-b border-amber-100 mb-8">
          <div className="h-8 bg-amber-100 rounded w-40 mb-4 animate-pulse" />
          <div className="h-12 bg-amber-100/60 rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <RecipeCardSkeleton key={n} />
          ))}
        </div>
      </div>
      </SidebarLayout>
    );
  }

  // 2) Once recipes are loaded (or we're loading more recipes), show the list.
  return (
    <SidebarLayout>
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Sticky header */}
      <div className="sticky top-0 bg-amber-50/95 backdrop-blur-sm z-10 py-4 -mx-4 px-4 shadow-sm border-b border-amber-100">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-4">My Recipes</h1>
          <SearchBar
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            isLoading={isSearching}
            resultCount={filteredRecipes.length}
            totalCount={totalRecipes}
          />

          {/* Quick filter list - links to Explore with filters */}
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium text-amber-900/80">Browse by category on Explore</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_FILTERS.cuisine.map((v) => (
                <Link key={v} href={getExploreFilterUrl('cuisine', v)} className="text-sm px-3 py-1.5 rounded-full border border-amber-200 bg-white hover:bg-amber-50 text-amber-900/80 transition-colors">
                  {v}
                </Link>
              ))}
              {QUICK_FILTERS.time.map((v) => (
                <Link key={v} href={getExploreFilterUrl('time', v)} className="text-sm px-3 py-1.5 rounded-full border border-amber-200 bg-white hover:bg-amber-50 text-amber-900/80 transition-colors">
                  {v}
                </Link>
              ))}
              {QUICK_FILTERS.diet.map((v) => (
                <Link key={v} href={getExploreFilterUrl('diet', v)} className="text-sm px-3 py-1.5 rounded-full border border-amber-200 bg-white hover:bg-amber-50 text-amber-900/80 transition-colors">
                  {v}
                </Link>
              ))}
              {QUICK_FILTERS.difficulty.map((v) => (
                <Link key={v} href={getExploreFilterUrl('difficulty', v)} className="text-sm px-3 py-1.5 rounded-full border border-amber-200 bg-white hover:bg-amber-50 text-amber-900/80 transition-colors">
                  {v}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content with top padding to account for sticky header */}
      <div className="mt-8">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <RecipeCardSkeleton key={n} />
            ))}
          </div>
        ) : filteredRecipes.length > 0 ? (
          <>
            <div>
              {/* Pinned Recipes */}
              <div className="mb-8">
                <h2 className="text-amber-900/80 text-sm font-semibold pb-2 border-b border-amber-100">
                  📌 Pinned Recipes
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
                  {pinnedRecipes.map((recipe, index) => (
                    <div key={recipe.id} className="relative">
                      <RecipeCard
                        key={recipe.id}
                        recipe={recipe}
                        showMenu={true}
                        onMenuClick={(id) => setMenuOpen(current => current === id ? null : id)}
                        isMenuOpen={menuOpen === recipe.id}
                        priority={index < 6}
                      />
                      {menuOpen === recipe.id && (
                        <div ref={menuRef} className="absolute right-2 top-2 bg-white rounded-3xl shadow-lg w-60 border border-amber-100 p-3 z-40">
                          <ul className="space-y-1">
                            <li>
                              <button
                                onClick={() => handlePinToggle(recipe.id, recipe.pinned || false)}
                                disabled={loadingPinAction === recipe.id}
                                className="w-full px-4 py-2 text-left hover:bg-amber-50 rounded-md flex items-center gap-2"
                              >
                                <FontAwesomeIcon
                                  icon={faThumbtack}
                                  className={`transform transition-all duration-300 ${
                                    recipe.pinned ? 'rotate-[45deg] scale-110 text-yellow-500' : 'hover:scale-110'
                                  }`}
                                />
                                {loadingPinAction === recipe.id ? (
                                  <span className="flex items-center">
                                    <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                                    {recipe.pinned ? 'Unpinning...' : 'Pinning...'}
                                  </span>
                                ) : (
                                  <span>{recipe.pinned ? 'Unpin Recipe' : 'Pin Recipe'}</span>
                                )}
                              </button>
                            </li>
                            <li>
                              <button
                                onClick={() => handleDelete(recipe.id, recipe.recipeTitle)}
                                disabled={loadingDeleteAction === recipe.id}
                                className="w-full px-4 py-2 text-left text-red-600 hover:bg-amber-50 rounded-md flex items-center gap-2"
                              >
                                <FontAwesomeIcon icon={faTrashCan} />
                                {loadingDeleteAction === recipe.id ? (
                                  <span className="flex items-center">
                                    <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                                    Deleting...
                                  </span>
                                ) : (
                                  <span>Delete Recipe</span>
                                )}
                              </button>
                            </li>
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* All Recipes */}
              <div>
                <h2 className="text-amber-900/80 text-sm font-semibold pb-2 border-b border-amber-100">
                  🍳 All Recipes
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
                  {unpinnedRecipes.map((recipe, index) => (
                    <div key={recipe.id} className="relative">
                      <RecipeCard
                        key={recipe.id}
                        recipe={recipe}
                        showMenu={true}
                        onMenuClick={(id) => setMenuOpen(current => current === id ? null : id)}
                        isMenuOpen={menuOpen === recipe.id}
                        priority={index < 6}
                      />
                      {menuOpen === recipe.id && (
                        <div ref={menuRef} className="absolute right-2 top-2 bg-white rounded-3xl shadow-lg w-60 border border-amber-100 p-3 z-40">
                          <ul className="space-y-1">
                            <li>
                              <button
                                onClick={() => handlePinToggle(recipe.id, recipe.pinned || false)}
                                disabled={loadingPinAction === recipe.id}
                                className="w-full px-4 py-2 text-left hover:bg-amber-50 rounded-md flex items-center gap-2"
                              >
                                <FontAwesomeIcon
                                  icon={faThumbtack}
                                  className={`transform transition-all duration-300 ${
                                    recipe.pinned ? 'rotate-[45deg] scale-110 text-yellow-500' : 'hover:scale-110'
                                  }`}
                                />
                                {loadingPinAction === recipe.id ? (
                                  <span className="flex items-center">
                                    <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                                    {recipe.pinned ? 'Unpinning...' : 'Pinning...'}
                                  </span>
                                ) : (
                                  <span>{recipe.pinned ? 'Unpin Recipe' : 'Pin Recipe'}</span>
                                )}
                              </button>
                            </li>
                            <li>
                              <button
                                onClick={() => handleDelete(recipe.id, recipe.recipeTitle)}
                                disabled={loadingDeleteAction === recipe.id}
                                className="w-full px-4 py-2 text-left text-red-600 hover:bg-amber-50 rounded-md flex items-center gap-2"
                              >
                                <FontAwesomeIcon icon={faTrashCan} />
                                {loadingDeleteAction === recipe.id ? (
                                  <span className="flex items-center">
                                    <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                                    Deleting...
                                  </span>
                                ) : (
                                  <span>Delete Recipe</span>
                                )}
                              </button>
                            </li>
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                  {loadingMore && [1, 2, 3].map((n) => (
                    <RecipeCardSkeleton key={`skeleton-${n}`} />
                  ))}
                </div>
              </div>
            </div>

            {/* Infinite scroll trigger */}
            {!searchTerm && hasMore && (
              <div
                ref={loadMoreRef}
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
    </div>
    </SidebarLayout>
  );
};

export default Recipes;
