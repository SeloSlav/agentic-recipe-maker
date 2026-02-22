"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faThumbtack, faTrashCan, faHeart } from "@fortawesome/free-solid-svg-icons";
import { Recipe } from "../types";
import { FilterTag } from "../../components/FilterTag";

/** Likes feature hidden from UI (data preserved). Set to true to re-enable. */
const SHOW_RECIPE_LIKES = false;

interface RecipeHeaderProps {
  recipe: Recipe;
  isOwner: boolean;
  isUserAdmin?: boolean;
  copySuccess: boolean;
  handleCopyRecipe: () => void;
  handlePinToggle: () => void;
  handleDelete: () => void;
  handleLike?: () => void;
  handleRegenerateTags?: () => void;
  loadingRegenerateTags?: boolean;
  currentUser?: any;
  loadingPinAction?: boolean;
  loadingDeleteAction?: boolean;
}

export const RecipeHeader = ({
  recipe,
  isOwner,
  isUserAdmin,
  copySuccess,
  handleCopyRecipe,
  handlePinToggle,
  handleDelete,
  handleLike,
  handleRegenerateTags,
  loadingRegenerateTags,
  currentUser,
  loadingPinAction,
  loadingDeleteAction,
}: RecipeHeaderProps) => {
  const hasLiked = recipe.likes?.includes(currentUser?.uid || '');
  const canManage = isOwner || isUserAdmin;
  const hasUnknownTags = !recipe.cuisineType || recipe.cuisineType === 'Unknown' ||
    !recipe.cookingTime || recipe.cookingTime === 'Unknown' ||
    !recipe.cookingDifficulty || recipe.cookingDifficulty === 'Unknown';

  return (
    <>
      {/* Recipe Classifications */}
      <div className="mb-6 flex flex-wrap gap-3 items-center">
        {recipe.diet.length > 0 && recipe.diet.map((d) => (
          <FilterTag key={d} type="diet" value={d} icon="🍲">
            {d.charAt(0).toUpperCase() + d.slice(1)}
          </FilterTag>
        ))}
        {recipe.cuisineType && (
          <FilterTag type="cuisine" value={recipe.cuisineType} icon="🍽️">
            {recipe.cuisineType.charAt(0).toUpperCase() + recipe.cuisineType.slice(1)}
          </FilterTag>
        )}
        {recipe.cookingTime && (
          <FilterTag type="time" value={recipe.cookingTime} icon="⏲️">
            {recipe.cookingTime}
          </FilterTag>
        )}
        {recipe.cookingDifficulty && (
          <FilterTag type="difficulty" value={recipe.cookingDifficulty} icon="🧩">
            {recipe.cookingDifficulty.charAt(0).toUpperCase() + recipe.cookingDifficulty.slice(1)}
          </FilterTag>
        )}
        {canManage && handleRegenerateTags && (
          <button
            onClick={handleRegenerateTags}
            disabled={loadingRegenerateTags}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              hasUnknownTags
                ? 'bg-amber-200 text-amber-900 hover:bg-amber-300'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {loadingRegenerateTags ? (
              <>
                <span className="animate-spin">⟳</span>
                <span>Regenerating...</span>
              </>
            ) : (
              <>
                <span>🔄</span>
                <span>Regenerate tags</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Action Bar */}
      <div className="flex flex-wrap gap-3 mb-8 items-center border-t border-b border-amber-100 py-4">
        <button
          onClick={handleCopyRecipe}
          className="flex items-center text-amber-900/80 hover:text-amber-900 transition-colors duration-200"
        >
          <FontAwesomeIcon icon={faCopy} className="w-5 h-5" />
          <span className="ml-2 text-sm">{copySuccess ? 'Link Copied!' : 'Share Recipe'}</span>
        </button>

        {SHOW_RECIPE_LIKES && (
          <>
            {/* Like button for all users */}
            <div className="w-px h-6 bg-amber-200" /> {/* Divider */}
            {handleLike && currentUser ? (
              <button
                onClick={handleLike}
                disabled={hasLiked}
                className={`flex items-center transition-colors duration-200 ${
                  hasLiked ? 'text-red-500 cursor-default' : 'text-amber-900/80 hover:text-red-500'
                }`}
              >
                <FontAwesomeIcon icon={faHeart} className="w-5 h-5" />
                <span className="ml-2 text-sm">
                  {hasLiked ? 'Liked' : 'Like Recipe'} {recipe.likes?.length ? `(${recipe.likes.length})` : ''}
                </span>
              </button>
            ) : (
              <div className={`flex items-center text-amber-800/70`}>
                <FontAwesomeIcon icon={faHeart} className="w-5 h-5" />
                <span className="ml-2 text-sm">
                  {recipe.likes?.length || 0} {recipe.likes?.length === 1 ? 'Like' : 'Likes'}
                </span>
              </div>
            )}
          </>
        )}

        {canManage && (
          <>
            <div className="w-px h-6 bg-amber-200" /> {/* Divider */}
            <button
              onClick={handlePinToggle}
              disabled={loadingPinAction}
              className={`flex items-center transition-colors duration-200 ${
                recipe.pinned ? 'text-amber-600 hover:text-amber-700' : 'text-amber-900/80 hover:text-amber-900'
              }`}
            >
              {loadingPinAction ? (
                <>
                  <div className="w-5 h-5">
                    <div className="w-full h-full border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                  <span className="ml-2 text-sm">{recipe.pinned ? 'Unpinning...' : 'Pinning...'}</span>
                </>
              ) : (
                <>
                  <FontAwesomeIcon 
                    icon={faThumbtack} 
                    className={`w-5 h-5 transform transition-all duration-300 ${
                      recipe.pinned ? 'rotate-[45deg] scale-110' : 'hover:scale-110'
                    }`}
                  />
                  <span className="ml-2 text-sm">{recipe.pinned ? 'Pinned' : 'Pin Recipe'}</span>
                </>
              )}
            </button>

            <div className="w-px h-6 bg-amber-200" /> {/* Divider */}
            <button
              onClick={handleDelete}
              disabled={loadingDeleteAction}
              className="flex items-center text-amber-900/80 hover:text-red-600 transition-colors duration-200"
            >
              {loadingDeleteAction ? (
                <>
                  <div className="w-5 h-5">
                    <div className="w-full h-full border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                  <span className="ml-2 text-sm">Deleting...</span>
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faTrashCan} className="w-5 h-5" />
                  <span className="ml-2 text-sm">Delete Recipe</span>
                </>
              )}
            </button>
          </>
        )}
      </div>
    </>
  );
}; 