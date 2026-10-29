"use client";

import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { db } from "../lib/backend/client";
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc, deleteDoc } from "../lib/backend/database"; // database methods
import { useAuth } from "../context/AuthContext"; // Import the AuthContext hook
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsisH, faThumbtack, faTrashAlt } from "@fortawesome/free-solid-svg-icons";
import { useDeleteRecipe } from "../context/DeleteRecipeContext";

interface Recipe {
  recipeTitle: string;
  id: string; // local backend document ID
  createdAt: any; // Add the createdAt field to sort by it
  pinned: boolean; // Indicates if the recipe is pinned
  imageURL: string;
}

export const RecipeList = () => {
  const { user } = useAuth(); // Get the currently authenticated user
  const [pinnedRecipes, setPinnedRecipes] = useState<Recipe[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [newRecipeIndex, setNewRecipeIndex] = useState<number | null>(null); // Track the index of the new recipe for animation
  const [menuOpen, setMenuOpen] = useState<string | null>(null); // Track which recipe's menu is open
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [loadingPinAction, setLoadingPinAction] = useState<string | null>(null);
  const menuPortalRef = useRef<HTMLDivElement>(null);
  const { showDeletePopup } = useDeleteRecipe();

  useEffect(() => {
    if (!user) return; // If no user is authenticated, do not fetch recipes

    // Fetch pinned recipes from database
    const fetchPinnedRecipes = () => {
      const recipeCollection = collection(db, "recipes");
      const pinnedQuery = query(
        recipeCollection,
        where("userId", "==", user.uid),
        where("pinned", "==", true),
        orderBy("createdAt", "desc"),
        limit(20)
      );

      const unsubscribe = onSnapshot(pinnedQuery, (snapshot) => {
        const pinnedRecipes = snapshot.docs.map((doc) => ({
          id: doc.id,
          recipeTitle: doc.data().recipeTitle,
          createdAt: doc.data().createdAt,
          pinned: doc.data().pinned,
          imageURL: doc.data().imageURL || null,
        }));
        setPinnedRecipes(pinnedRecipes);
      });

      return unsubscribe;
    };

    // Fetch all recipes from database
    const fetchRecipes = () => {
      const recipeCollection = collection(db, "recipes");
      const allQuery = query(
        recipeCollection,
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc"),
        limit(20)
      );

      const unsubscribe = onSnapshot(allQuery, (snapshot) => {
        const allRecipes = snapshot.docs.map((doc) => ({
          id: doc.id,
          recipeTitle: doc.data().recipeTitle,
          createdAt: doc.data().createdAt,
          pinned: doc.data().pinned,
          imageURL: doc.data().imageURL || null,
        }));

        // Filter out pinned recipes
        const nonPinnedRecipes = allRecipes.filter(
          (recipe) => !recipe.pinned
        );

        setRecipes(nonPinnedRecipes);
      });

      return unsubscribe;
    };

    const unsubscribePinned = fetchPinnedRecipes();
    const unsubscribeAll = fetchRecipes();

    return () => {
      unsubscribePinned();
      unsubscribeAll();
    };
  }, [user]);

  const handleMenuToggle = (id: string, triggerEl?: HTMLElement) => {
    if (menuOpen === id) {
      setMenuOpen(null);
      setMenuPosition(null);
      return;
    }
    if (triggerEl) {
      const rect = triggerEl.getBoundingClientRect();
      setMenuPosition({ top: rect.bottom + 4, left: rect.right - 192 }); // w-48 = 192px
    }
    setMenuOpen(id);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const trigger = document.querySelector(`[data-recipe-menu-trigger="${menuOpen}"]`);
      const clickedTrigger = trigger?.contains(target);
      const clickedMenu = menuPortalRef.current?.contains(target);
      if (!clickedTrigger && !clickedMenu) {
        setMenuOpen(null);
        setMenuPosition(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handlePinUnpin = async (id: string, isPinned: boolean) => {
    try {
      setLoadingPinAction(id);
      const recipeRef = doc(db, "recipes", id);
      await updateDoc(recipeRef, {
        pinned: !isPinned,
        lastPinnedAt: !isPinned ? new Date().toISOString() : null
      });
      setMenuOpen(null);
      setMenuPosition(null);
    } catch (error) {
      console.error("Error toggling pin: ", error);
    } finally {
      setLoadingPinAction(null);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    showDeletePopup(id, title, async () => {
      try {
        const recipeRef = doc(db, "recipes", id);
        await deleteDoc(recipeRef);
        setPinnedRecipes((prev) => prev.filter((recipe) => recipe.id !== id));
        setRecipes((prev) => prev.filter((recipe) => recipe.id !== id));
        setMenuOpen(null);
      } catch (error) {
        console.error("Error deleting recipe: ", error);
      }
    });
  };

  const renderMenuPortal = () => {
    if (!menuOpen || !menuPosition || typeof document === "undefined") return null;
    const recipe = [...pinnedRecipes, ...recipes].find((r) => r.id === menuOpen);
    if (!recipe) return null;
    const isPinning = loadingPinAction === recipe.id;

    return createPortal(
      <div
        ref={menuPortalRef}
        className="fixed z-[9999] bg-white rounded-3xl shadow-lg w-48 border border-amber-100 p-3"
        style={{ top: menuPosition.top, left: menuPosition.left }}
      >
        <ul className="space-y-1">
          <li
            className="flex items-center px-4 py-2 rounded-md hover:bg-amber-50 cursor-pointer disabled:opacity-50"
            onClick={() => !isPinning && handlePinUnpin(recipe.id, recipe.pinned)}
          >
            {isPinning ? (
              <>
                <div className="w-4 h-4 mr-3">
                  <div className="w-full h-full border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
                <span>{recipe.pinned ? "Unpinning..." : "Pinning..."}</span>
              </>
            ) : (
              <>
                <FontAwesomeIcon
                  icon={faThumbtack}
                  className={`w-4 h-4 mr-3 transform transition-all duration-300 ${
                    recipe.pinned ? "rotate-[45deg] scale-110 text-amber-600" : "hover:scale-110 text-amber-600/70"
                  }`}
                />
                <span>{recipe.pinned ? "Unpin Recipe" : "Pin Recipe"}</span>
              </>
            )}
          </li>
          <li
            className="flex items-center px-4 py-2 rounded-md hover:bg-amber-50 cursor-pointer text-red-500"
            onClick={() => {
              handleDelete(recipe.id, recipe.recipeTitle);
              setMenuOpen(null);
              setMenuPosition(null);
            }}
          >
            <FontAwesomeIcon icon={faTrashAlt} className="w-4 h-4 mr-3" />
            <span>Delete recipe</span>
          </li>
        </ul>
      </div>,
      document.body
    );
  };

  return (
    <div className="space-y-4">
      {user ? (
        <>
          <div>
            <h2 className="text-amber-900/80 text-sm font-semibold pb-2 border-b border-amber-100">
              Pinned Recipes
            </h2>
            {pinnedRecipes.map((recipe, index) => (
              <div
                key={recipe.id}
                className={`relative group p-3 mt-2 rounded-md min-h-[88px] overflow-hidden ${!recipe.imageURL ? "bg-amber-100 hover:bg-amber-200/80" : ""}`}
              >
                {recipe.imageURL && (
                  <>
                    <Image
                      src={recipe.imageURL}
                      alt={recipe.recipeTitle}
                      fill
                      sizes="256px"
                      className="object-cover rounded-md"
                      priority={index < 3}
                      placeholder="blur"
                      blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQACEQD/ALAB/9k="
                    />
                    <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-50 rounded-md transition-opacity" />
                  </>
                )}

                <button
                  data-recipe-menu-trigger={recipe.id}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleMenuToggle(recipe.id, e.currentTarget);
                  }}
                  className={`absolute top-2 right-2 z-20 p-1.5 rounded-full transition-opacity ${
                    recipe.imageURL
                      ? "text-white/90 hover:text-white hover:bg-white/20"
                      : "text-amber-700/70 hover:bg-amber-100"
                  } group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100`}
                >
                  <FontAwesomeIcon icon={faEllipsisH} className="w-4 h-4" />
                </button>

                <Link href={`/recipe/${recipe.id}`} passHref>
                  <div className="relative z-10">
                    <div
                      className={`flex justify-between items-center pr-8 ${recipe.imageURL
                        ? "text-white font-bold text-shadow [text-shadow:_0_2px_4px_rgb(0_0_0_/_0.8)]"
                        : "text-black"
                      }`}
                    >
                      {recipe.recipeTitle}
                    </div>
                  </div>
                </Link>
              </div>
            ))}
            {pinnedRecipes.length === 0 && (
              <div className="text-center px-6 py-5 bg-amber-50/60 rounded-xl border border-amber-100 mt-3 backdrop-blur-sm">
                <div className="text-xl mb-1.5">📌</div>
                <p className="font-medium text-gray-700">No pinned recipes yet</p>
                <p className="text-gray-500 text-sm mt-0.5">Pin your favorites for quick access</p>
              </div>
            )}
          </div>

          <div>
            <h2 className="text-amber-900/80 text-sm font-semibold pb-2 border-b border-amber-100">
              Recently Saved Recipes
            </h2>
            {recipes.map((recipe, index) => (
              <div
                key={recipe.id}
                className={`relative group p-3 mt-2 rounded-md min-h-[88px] overflow-hidden ${!recipe.imageURL ? "bg-amber-50 hover:bg-amber-100" : ""}`}
              >
                {recipe.imageURL && (
                  <>
                    <Image
                      src={recipe.imageURL}
                      alt={recipe.recipeTitle}
                      fill
                      sizes="256px"
                      className="object-cover rounded-md"
                      priority={index < 3}
                      placeholder="blur"
                      blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQACEQD/ALAB/9k="
                    />
                    <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-50 rounded-md transition-opacity" />
                  </>
                )}

                <button
                  data-recipe-menu-trigger={recipe.id}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleMenuToggle(recipe.id, e.currentTarget);
                  }}
                  className={`absolute top-2 right-2 z-20 p-1.5 rounded-full transition-opacity ${
                    recipe.imageURL
                      ? "text-white/90 hover:text-white hover:bg-white/20"
                      : "text-amber-700/70 hover:bg-amber-100"
                  } group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100`}
                >
                  <FontAwesomeIcon icon={faEllipsisH} className="w-4 h-4" />
                </button>

                <Link href={`/recipe/${recipe.id}`} passHref>
                  <div className="relative z-10">
                    <div
                      className={`flex justify-between items-center pr-8 ${recipe.imageURL
                        ? "text-white font-bold text-shadow [text-shadow:_0_2px_4px_rgb(0_0_0_/_0.8)]"
                        : "text-black"
                      }`}
                    >
                      {recipe.recipeTitle}
                    </div>
                  </div>
                </Link>
              </div>
            ))}
            {recipes.length === 0 && (
              <div className="text-center px-6 py-5 bg-amber-50/60 rounded-xl border border-amber-100 mt-3 backdrop-blur-sm">
                <div className="text-xl mb-1.5">📝</div>
                <p className="font-medium text-gray-700">No recipes saved yet</p>
                <p className="text-gray-500 text-sm mt-0.5">Your culinary journey starts here</p>
              </div>
            )}
          </div>

          {renderMenuPortal()}
        </>
      ) : (
        <div className="bg-gradient-to-b from-amber-50 to-white rounded-xl border border-amber-100 p-6 shadow-sm">
          <div className="max-w-[260px] mx-auto">
            <div className="text-center mb-4">
              <div className="text-2xl mb-2">👩‍🍳</div>
              <h3 className="text-lg font-bold text-gray-900 leading-tight">
                Your Balkan Recipe Companion Awaits
              </h3>
            </div>
            <p className="text-sm text-gray-700 text-center mb-3 font-medium">
              Join Baba Selo—accurate recipes, grandma vibes, real advice:
            </p>
            <ul className="space-y-2 text-sm text-gray-700 mb-5 text-left">
              <li className="flex gap-2.5">
                <span className="text-amber-600 mt-0.5 shrink-0">•</span>
                <span>Actually accurate Balkan & regional recipes</span>
              </li>
              <li className="flex gap-2.5">
                <span className="text-amber-600 mt-0.5 shrink-0">•</span>
                <span>Save & pin your favorites</span>
              </li>
              <li className="flex gap-2.5">
                <span className="text-amber-600 mt-0.5 shrink-0">•</span>
                <span>Advice that helps—no generic bot fluff</span>
              </li>
            </ul>
            <Link
              href="/login"
              className="block w-full text-center py-3 px-6 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-700 active:scale-[0.98] transition-all shadow-md shadow-amber-900/20 hover:shadow-lg hover:shadow-amber-900/25"
            >
              Get Started Free
            </Link>
            <p className="text-xs text-gray-500 text-center mt-3">
              No credit card required
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
