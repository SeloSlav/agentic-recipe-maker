"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { db } from "../lib/backend/client";
import { SidebarLayout } from '../components/SidebarLayout';
import { collection, query, orderBy, getDocs, getCountFromServer, doc, updateDoc, arrayUnion, Timestamp, increment, getDoc, startAfter, limit, where } from '../lib/backend/database';
import { useAuth } from '../context/AuthContext';
import { usePoints } from '../context/PointsContext';
import { Recipe } from '../recipe/types';
import { SearchBar } from '../components/SearchBar';
import { RecipeCard } from '../components/RecipeCard';
import { RecipeCardSkeleton } from '../components/RecipeCardSkeleton';
import { getExploreFilterUrl } from '../components/FilterTag';

const POINTS_FOR_LIKE = 50; // Points awarded when someone likes your recipe

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
  cuisine: ['Italian', 'Mexican', 'Japanese', 'Indian', 'Mediterranean', 'American', 'Thai', 'Chinese', 'Balkan', 'Bulgarian', 'Croatian', 'Eastern European', 'Middle Eastern', 'Costa Rican'],
  time: ['15 min', '30 min', '45 min', '1 hour', '1.5 hours'],
  diet: ['Vegetarian', 'Vegan', 'Pescetarian', 'Omnivore', 'Gluten-free', 'Dairy-free', 'Keto', 'Paleo'],
  difficulty: ['Easy', 'Medium', 'Hard'],
} as const;

type FilterCategory = keyof typeof QUICK_FILTERS;

const FILTER_LABELS: Record<FilterCategory, string> = {
  cuisine: 'Cuisine',
  time: 'Time',
  diet: 'Diet',
  difficulty: 'Difficulty',
};

export default function ExplorePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [totalRecipes, setTotalRecipes] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const { user } = useAuth();
  const { showPointsToast } = usePoints();
  const [currentUsername, setCurrentUsername] = useState<string>('');
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const lastVisibleRef = useRef<any>(null);
  const prevSearchTermRef = useRef(searchTerm);
  const [filterCounts, setFilterCounts] = useState<Record<FilterCategory, Record<string, number>>>({
    cuisine: {},
    time: {},
    diet: {},
    difficulty: {},
  });
  const [filtersPopoverOpen, setFiltersPopoverOpen] = useState(false);
  const filtersPopoverRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filtersPopoverRef.current && !filtersPopoverRef.current.contains(e.target as Node)) {
        setFiltersPopoverOpen(false);
      }
    };
    if (filtersPopoverOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [filtersPopoverOpen]);

  lastVisibleRef.current = lastVisible;

  const RECIPES_PER_PAGE = 12;

  // Build search term from URL params (cuisine, time, diet, difficulty)
  const urlFilterTerms = [
    searchParams.get('cuisine'),
    searchParams.get('time'),
    searchParams.get('diet'),
    searchParams.get('difficulty'),
  ].filter(Boolean) as string[];

  const activeFilters = {
    cuisine: searchParams.get('cuisine'),
    time: searchParams.get('time'),
    diet: searchParams.get('diet'),
    difficulty: searchParams.get('difficulty'),
  };

  const hasUrlFilters = urlFilterTerms.length > 0;
  const urlParamsKey = searchParams.toString(); // Unique key for URL changes

  // Always sync URL params to search term when URL changes (fixes stale filters)
  useEffect(() => {
    if (hasUrlFilters) {
      setSearchTerm(urlFilterTerms.join(' '));
    } else {
      setSearchTerm('');
    }
  }, [urlParamsKey]); // eslint-disable-line react-hooks/exhaustive-deps -- urlFilterTerms derived from searchParams

  const clearAllFilters = () => {
    setSearchTerm('');
    router.replace('/explore');
  };

  const removeFilter = (type: 'cuisine' | 'time' | 'diet' | 'difficulty') => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(type);
    const newSearch = [
      params.get('cuisine'),
      params.get('time'),
      params.get('diet'),
      params.get('difficulty'),
    ].filter(Boolean).join(' ');
    setSearchTerm(newSearch);
    router.replace(params.toString() ? `/explore?${params.toString()}` : '/explore');
  };

  const isRecipeComplete = (recipe: Recipe) => {
    return recipe.recipeSummary &&
           recipe.imageURL; // Simplified conditions to just require summary and image
  };

  const fetchRecipes = useCallback(async (loadMore = false) => {
    try {
      if (loadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setIsPageLoading(true);
      }

      const cursor = loadMore ? lastVisibleRef.current : null;

      // Create a query for recipes, ordered by creation date
      const recipesQuery = cursor
        ? query(
            collection(db, "recipes"),
            orderBy("createdAt", "desc"),
            startAfter(cursor),
            limit(RECIPES_PER_PAGE)
          )
        : query(
            collection(db, "recipes"),
            orderBy("createdAt", "desc"),
            limit(RECIPES_PER_PAGE)
          );

      // Use getCountFromServer - 1000x cheaper than fetching all docs
      const countQuery = query(collection(db, "recipes"));

      const [recipeDocs, countSnapshot] = await Promise.all([
        getDocs(recipesQuery),
        getCountFromServer(countQuery)
      ]);

      setTotalRecipes(countSnapshot.data().count);

      // Process all recipes
      const fetchedRecipes = recipeDocs.docs.map(doc => {
        const data = doc.data() as RecipeDocument;
        return {
          id: doc.id,
          ...data,
          username: 'Anonymous Chef', // We'll update this later
          likes: data.likes || []
        };
      });

      // Get usernames for all recipes
      const userIds = new Set(fetchedRecipes.map(recipe => recipe.userId).filter(Boolean));

      let userMap = new Map();
      if (userIds.size > 0) {
        const usersQuery = query(
          collection(db, "users"),
          where("__name__", "in", Array.from(userIds))
        );
        const userDocs = await getDocs(usersQuery);
        userDocs.docs.forEach(doc => {
          userMap.set(doc.id, doc.data().username);
        });
      }

      // Update usernames and sort recipes by completeness and creation date
      const recipesWithUsernames = fetchedRecipes
        .map(recipe => ({
          ...recipe,
          username: userMap.get(recipe.userId) || 'Anonymous Chef'
        }))
        .sort((a, b) => {
          // First sort by completeness
          const aComplete = isRecipeComplete(a);
          const bComplete = isRecipeComplete(b);
          if (aComplete !== bComplete) {
            return aComplete ? -1 : 1;
          }
          // Then sort by creation date (newest first)
          return b.createdAt?.toDate?.() - a.createdAt?.toDate?.() || 0;
        });

      // Update lastVisible for pagination
      const lastDoc = recipeDocs.docs[recipeDocs.docs.length - 1];
      setLastVisible(lastDoc);
      setHasMore(recipeDocs.docs.length === RECIPES_PER_PAGE);

      if (loadMore) {
        setRecipes(prev => [...prev, ...recipesWithUsernames]);
      } else {
        setRecipes(recipesWithUsernames);
      }
    } catch (error) {
      console.error("Error fetching recipes:", error);
    } finally {
      if (loadMore) {
        setLoadingMore(false);
      } else {
        setLoading(false);
        setIsPageLoading(false);
      }
    }
  }, []);

  const fetchCurrentUsername = async () => {
    if (!user) return;
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        setCurrentUsername(userDoc.data().username || 'Anonymous Chef');
      }
    } catch (error) {
      console.error("Error fetching username:", error);
    }
  };

  useEffect(() => {
    if (hasUrlFilters) {
      setRecipes([]);
      setIsPageLoading(false);
      return;
    }
    fetchRecipes();
  }, [fetchRecipes, hasUrlFilters]);

  useEffect(() => {
    if (user) fetchCurrentUsername();
  }, [user]);

  // Fetch counts per filter value (no composite indexes needed - single-field queries)
  useEffect(() => {
    async function fetchFilterCounts() {
      const counts: Record<FilterCategory, Record<string, number>> = {
        cuisine: {},
        time: {},
        diet: {},
        difficulty: {},
      };
      try {
        await Promise.all([
          ...QUICK_FILTERS.cuisine.map(async (v) => {
            const q = query(collection(db, "recipes"), where("cuisineType", "==", v));
            const snap = await getCountFromServer(q);
            counts.cuisine[v] = snap.data().count;
          }),
          ...QUICK_FILTERS.time.map(async (v) => {
            const q = query(collection(db, "recipes"), where("cookingTime", "==", v));
            const snap = await getCountFromServer(q);
            counts.time[v] = snap.data().count;
          }),
          ...QUICK_FILTERS.diet.map(async (v) => {
            const q = query(collection(db, "recipes"), where("diet", "array-contains", v));
            const snap = await getCountFromServer(q);
            counts.diet[v] = snap.data().count;
          }),
          ...QUICK_FILTERS.difficulty.map(async (v) => {
            const q = query(collection(db, "recipes"), where("cookingDifficulty", "==", v));
            const snap = await getCountFromServer(q);
            counts.difficulty[v] = snap.data().count;
          }),
        ]);
        setFilterCounts(counts);
      } catch (err) {
        console.error("Failed to fetch filter counts:", err);
      }
    }
    fetchFilterCounts();
  }, []);

  const handleLike = async (recipe: Recipe) => {
    if (!user) return;

    try {
      const recipeRef = doc(db, "recipes", recipe.id);
      const currentLikes = recipe.likes || [];
      const hasLiked = currentLikes.includes(user.uid);

      // If already liked, do nothing
      if (hasLiked) {
        return;
      }

      // Like (one-way action)
      await updateDoc(recipeRef, {
        likes: arrayUnion(user.uid)
      });
      setRecipes(prev => prev.map(r =>
        r.id === recipe.id
          ? { ...r, likes: [...(r.likes || []), user.uid] }
          : r
      ));

      // Award points to recipe owner if it's not their own recipe
      if (recipe.userId && recipe.userId !== user.uid) {
        try {
          const spoonRef = doc(db, "users", recipe.userId, "spoonPoints", "points");
          const transaction = {
            actionType: "RECIPE_SAVED_BY_OTHER",
            points: POINTS_FOR_LIKE,
            timestamp: Timestamp.now(),
            targetId: recipe.id,
            details: `Recipe "${recipe.recipeTitle}" liked by @${currentUsername}`
          };

          await updateDoc(spoonRef, {
            totalPoints: increment(POINTS_FOR_LIKE),
            transactions: arrayUnion(transaction)
          });
        } catch (pointsError) {
          console.error("Error awarding points:", pointsError);
          // Don't throw the error since the like was still successful
        }
      }
    } catch (error) {
      console.error("Error updating like:", error);
    }
  };

  /** Fetch recipes using database where clauses - matches filter counts, no 150 limit */
  const fetchFilteredRecipes = useCallback(async (filters: typeof activeFilters) => {
    setIsSearching(true);
    try {
      const constraints: any[] = [];
      if (filters.cuisine) constraints.push(where("cuisineType", "==", filters.cuisine));
      if (filters.time) constraints.push(where("cookingTime", "==", filters.time));
      if (filters.difficulty) constraints.push(where("cookingDifficulty", "==", filters.difficulty));
      if (filters.diet) constraints.push(where("diet", "array-contains", filters.diet));

      const recipesQuery = query(
        collection(db, "recipes"),
        ...constraints,
        orderBy("createdAt", "desc"),
        limit(500)
      );
      const querySnapshot = await getDocs(recipesQuery);

      const allRecipes = querySnapshot.docs
        .map(d => {
          const data = d.data() as RecipeDocument;
          return {
            id: d.id,
            ...data,
            username: 'Anonymous Chef',
            likes: data.likes || []
          };
        })
        .filter(recipe => recipe.imageURL);

      const userIds = [...new Set(allRecipes.map(r => r.userId).filter(Boolean))];
      const userMap = new Map<string, string>();
      for (let i = 0; i < userIds.length; i += 30) {
        const batch = userIds.slice(i, i + 30);
        const usersQuery = query(
          collection(db, "users"),
          where("__name__", "in", batch)
        );
        const userDocs = await getDocs(usersQuery);
        userDocs.docs.forEach(d => userMap.set(d.id, d.data().username || ""));
      }

      const withUsernames = allRecipes.map(recipe => ({
        ...recipe,
        username: userMap.get(recipe.userId) || 'Anonymous Chef'
      }));

      setRecipes(withUsernames);
      setHasMore(false);
    } catch (error) {
      console.error("Error fetching filtered recipes:", error);
      setRecipes([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  /** Text search - fetches 150 then filters client-side (for search bar input) */
  const searchRecipes = useCallback(async (searchTerms: string[]) => {
    setIsSearching(true);
    try {
      const recipesQuery = query(
        collection(db, "recipes"),
        where("recipeSummary", "!=", ""),
        orderBy("createdAt", "desc"),
        limit(150)
      );
      const querySnapshot = await getDocs(recipesQuery);

      const allRecipes = querySnapshot.docs
        .map(d => {
          const data = d.data() as RecipeDocument;
          return {
            id: d.id,
            ...data,
            username: 'Anonymous Chef',
            likes: data.likes || []
          };
        })
        .filter(recipe => recipe.imageURL);

      const userIds = [...new Set(allRecipes.map(r => r.userId).filter(Boolean))];
      const userMap = new Map<string, string>();
      for (let i = 0; i < userIds.length; i += 30) {
        const batch = userIds.slice(i, i + 30);
        const usersQuery = query(
          collection(db, "users"),
          where("__name__", "in", batch)
        );
        const userDocs = await getDocs(usersQuery);
        userDocs.docs.forEach(d => userMap.set(d.id, d.data().username || ""));
      }

      const filtered = allRecipes
        .map(recipe => ({
          ...recipe,
          username: userMap.get(recipe.userId) || 'Anonymous Chef'
        }))
        .filter((recipe) => {
          const diets = Array.isArray(recipe.diet) ? recipe.diet : [];
          const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
          const searchableFields = [
            recipe.recipeTitle?.toLowerCase() || "",
            recipe.username?.toLowerCase() || "",
            recipe.cuisineType?.toLowerCase() || "",
            recipe.cookingDifficulty?.toLowerCase() || "",
            recipe.cookingTime?.toLowerCase() || "",
            recipe.recipeSummary?.toLowerCase() || "",
            ...diets.map(d => d.toLowerCase()),
            ...ingredients.map(i => i.toLowerCase()),
          ].filter(Boolean);
          return searchTerms.every((term) =>
            searchableFields.some((field) => field.includes(term))
          );
        });

      setRecipes(filtered);
      setHasMore(false);
    } catch (error) {
      console.error("Error searching recipes:", error);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search effect - use database query for URL filters (matches counts), text search otherwise
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!searchTerm.trim()) {
        const hadSearchTerm = prevSearchTermRef.current.trim() !== "";
        prevSearchTermRef.current = searchTerm;
        if (hadSearchTerm) fetchRecipes();
        return;
      }
      prevSearchTermRef.current = searchTerm;
      if (hasUrlFilters) {
        fetchFilteredRecipes(activeFilters);
      } else {
        const terms = searchTerm.toLowerCase().split(" ").filter(Boolean);
        if (terms.length > 0) searchRecipes(terms);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [searchTerm, fetchRecipes, searchRecipes, fetchFilteredRecipes, hasUrlFilters, urlParamsKey]);

  // Remove the old searchRecipes function and filteredRecipes constant
  const displayedRecipes = searchTerm ? recipes : recipes;

  // Intersection observer for infinite scroll
  useEffect(() => {
    const currentRef = loadMoreRef.current;
    if (!currentRef) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasMore && !loadingMore && !searchTerm && !isPageLoading) {
          fetchRecipes(true);
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observer.observe(currentRef);
    return () => observer.unobserve(currentRef);
  }, [hasMore, loadingMore, searchTerm, isPageLoading, fetchRecipes]);

  return (
    <SidebarLayout>
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Sticky header */}
      <div className="sticky top-0 bg-amber-50/95 backdrop-blur-sm z-10 py-4 -mx-4 px-4 shadow-sm border-b border-amber-100">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-4">Explore Recipes</h1>
          <SearchBar
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            isLoading={isSearching}
            isPageLoading={isPageLoading}
            resultCount={displayedRecipes.length}
            totalCount={totalRecipes}
            isExplorePage={true}
          />

          {/* Filters row: active chips (click to remove) + Filters button */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {hasUrlFilters && (
              <>
                {activeFilters.cuisine && (
                  <button
                    type="button"
                    onClick={() => removeFilter('cuisine')}
                    className="inline-flex items-center gap-1.5 bg-amber-100 border border-amber-200 rounded-full px-3 py-1 text-sm hover:bg-amber-200 transition-colors"
                    title="Click to remove"
                  >
                    🍽️ {activeFilters.cuisine} ×
                  </button>
                )}
                {activeFilters.time && (
                  <button
                    type="button"
                    onClick={() => removeFilter('time')}
                    className="inline-flex items-center gap-1.5 bg-amber-100 border border-amber-200 rounded-full px-3 py-1 text-sm hover:bg-amber-200 transition-colors"
                    title="Click to remove"
                  >
                    ⏲️ {activeFilters.time} ×
                  </button>
                )}
                {activeFilters.diet && (
                  <button
                    type="button"
                    onClick={() => removeFilter('diet')}
                    className="inline-flex items-center gap-1.5 bg-amber-100 border border-amber-200 rounded-full px-3 py-1 text-sm hover:bg-amber-200 transition-colors"
                    title="Click to remove"
                  >
                    🍲 {activeFilters.diet} ×
                  </button>
                )}
                {activeFilters.difficulty && (
                  <button
                    type="button"
                    onClick={() => removeFilter('difficulty')}
                    className="inline-flex items-center gap-1.5 bg-amber-100 border border-amber-200 rounded-full px-3 py-1 text-sm hover:bg-amber-200 transition-colors"
                    title="Click to remove"
                  >
                    🧩 {activeFilters.difficulty} ×
                  </button>
                )}
                <button onClick={clearAllFilters} className="text-sm text-amber-700 hover:text-amber-900 underline">
                  Clear all
                </button>
                <span className="text-amber-400">|</span>
              </>
            )}
            {/* Filters popover trigger */}
            <div className="relative" ref={filtersPopoverRef}>
              <button
                type="button"
                onClick={() => setFiltersPopoverOpen((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                  filtersPopoverOpen
                    ? 'border-amber-500 bg-amber-100 text-amber-900'
                    : 'border-amber-200 bg-white hover:bg-amber-50 text-amber-900/80'
                }`}
                aria-expanded={filtersPopoverOpen}
              >
                {hasUrlFilters ? 'Change filters' : 'Filters'}
                <span className="text-amber-600">{filtersPopoverOpen ? '▲' : '▼'}</span>
              </button>
              {filtersPopoverOpen && (
                <div className="absolute left-0 top-full mt-1 z-50 w-[min(90vw,420px)] max-h-[70vh] overflow-y-auto rounded-xl border border-amber-200 bg-white shadow-lg p-4">
                  <p className="text-xs font-medium text-amber-700/80 uppercase tracking-wide mb-3">Pick one from each category</p>
                  <div className="space-y-3">
                    {(['cuisine', 'time', 'diet', 'difficulty'] as FilterCategory[]).map((category) => (
                      <div key={category}>
                        <p className="text-xs font-medium text-amber-700/80 mb-1.5">{FILTER_LABELS[category]}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {QUICK_FILTERS[category].map((v) => {
                            const isActive = activeFilters[category] === v;
                            const count = filterCounts[category]?.[v] ?? null;
                            return (
                              <Link
                                key={v}
                                href={getExploreFilterUrl(category, v, searchParams)}
                                onClick={() => setFiltersPopoverOpen(false)}
                                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                  isActive
                                    ? 'border-amber-500 bg-amber-100 text-amber-900 font-medium'
                                    : 'border-amber-200 bg-white hover:bg-amber-50 text-amber-900/80'
                                }`}
                              >
                                {v}
                                {count !== null && <span className="text-amber-600/80"> ({count})</span>}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mt-8">
        {(isPageLoading || (isSearching && recipes.length === 0)) ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <RecipeCardSkeleton key={n} />
            ))}
          </div>
        ) : displayedRecipes.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayedRecipes.map((recipe, index) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  onLike={handleLike}
                  currentUser={user}
                  showUsername={true}
                  priority={index < 6}
                />
              ))}
              {loadingMore && [1, 2, 3].map((n) => (
                <RecipeCardSkeleton key={`skeleton-${n}`} />
              ))}
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
}