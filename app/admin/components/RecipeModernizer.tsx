import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, getDocs, doc, updateDoc, orderBy, limit, startAfter, where, deleteDoc } from '../../lib/backend/database';
import { db } from "../../lib/backend/client";
import { Recipe } from '../../recipe/types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSync, faArrowRight, faArrowLeft, faFilter, faSearch, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { LoadingSpinner } from '../../components/LoadingSpinner';

// Custom scrollbar styles
const scrollbarStyles = `
  .custom-scrollbar::-webkit-scrollbar {
    width: 8px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #888;
    border-radius: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #555;
  }
`;

interface RecipeModernizerProps {
  showPointsToast: (points: number, message: string) => void;
}

// Add new types for the automation
type ColumnType = 'classification' | 'summary' | 'nutrition' | 'pairings';
type AutomationState = {
  isRunning: boolean;
  currentColumn: ColumnType;
  currentPage: number;
  processingRecipes: Set<string>;
};

const RecipeModernizer: React.FC<RecipeModernizerProps> = ({ showPointsToast }) => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [modernizingStates, setModernizingStates] = useState<{[key: string]: Set<string>}>({
    details: new Set(),
    classification: new Set(),
    summary: new Set(),
    nutrition: new Set(),
    pairings: new Set()
  });
  const [totalRecipes, setTotalRecipes] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSnapshots, setPageSnapshots] = useState<any[]>([null]);
  const BATCH_SIZE = 7;
  const [automation, setAutomation] = useState<AutomationState>({
    isRunning: false,
    currentColumn: 'classification',
    currentPage: 1,
    processingRecipes: new Set()
  });

  // Calculate total pages
  const totalPages = Math.ceil(totalRecipes / BATCH_SIZE);

  // Helper function to update modernizing states
  const setModernizingState = (type: string, recipeId: string, isLoading: boolean) => {
    setModernizingStates(prev => {
      const newState = { ...prev };
      if (isLoading) {
        newState[type] = new Set(prev[type]).add(recipeId);
      } else {
        newState[type] = new Set([...prev[type]].filter(id => id !== recipeId));
      }
      return newState;
    });
  };

  // Helper function to check if a recipe is being modernized
  const isModernizing = (type: string, recipeId: string) => {
    return modernizingStates[type]?.has(recipeId);
  };

  // Function to check if a recipe needs modernization
  const needsModernization = (recipe: Recipe) => {
    // Check each step in sequence
    if (!recipe.ingredients?.length || !recipe.directions?.length) {
      return 'details';
    }
    if (!recipe.cuisineType || !recipe.cookingDifficulty || !recipe.diet?.length) {
      return 'classification';
    }
    if (!recipe.recipeSummary) {
      return 'summary';
    }
    if (!recipe.macroInfo) {
      return 'nutrition';
    }
    if (!recipe.dishPairings) {
      return 'pairings';
    }
    return null; // Recipe is fully modernized
  };

  // Function to fetch total count
  const fetchTotalCount = async () => {
    try {
      const snapshot = await getDocs(query(
        collection(db, 'recipes'),
        where('directionsCount', '==', 0)
      ));
      setTotalRecipes(snapshot.size);
    } catch (error) {
      console.error('Error fetching total count:', error);
    }
  };

  // Function to fetch recipes for a specific page
  const fetchRecipes = async (page: number = 1) => {
    try {
      setLoading(true);
      setCurrentPage(page);

      // Query for recipes that need modernization
      let recipesQuery = query(
        collection(db, 'recipes'),
        where('directionsCount', '==', 0),
        orderBy('createdAt', 'asc'),
        limit(BATCH_SIZE)
      );

      // If going to a page we haven't fetched yet
      if (page > 1) {
        // We need to build up all snapshots until this page
        let lastDoc = pageSnapshots[pageSnapshots.length - 1];

        // If we don't have the previous page's snapshot, we need to fetch all pages up to this one
        if (!lastDoc || page > pageSnapshots.length) {
          for (let i = pageSnapshots.length; i < page; i++) {
            const prevPageQuery = query(
              collection(db, 'recipes'),
              where('directionsCount', '==', 0),
              orderBy('createdAt', 'asc'),
              startAfter(lastDoc || null),
              limit(BATCH_SIZE)
            );
            const prevPageDocs = await getDocs(prevPageQuery);
            lastDoc = prevPageDocs.docs[prevPageDocs.docs.length - 1];
            if (lastDoc) {
              setPageSnapshots(prev => [...prev, lastDoc]);
            } else {
              // If we can't get a snapshot, we've reached the end
              setTotalRecipes((i) * BATCH_SIZE);
              break;
            }
          }
        }

        // Now use the last snapshot we have
        if (lastDoc) {
          recipesQuery = query(
            collection(db, 'recipes'),
            where('directionsCount', '==', 0),
            orderBy('createdAt', 'asc'),
            startAfter(lastDoc),
            limit(BATCH_SIZE)
          );
        }
      }

      const recipeDocs = await getDocs(recipesQuery);

      // Store the last document of this page if we haven't stored it yet
      if (page >= pageSnapshots.length) {
        const lastDoc = recipeDocs.docs[recipeDocs.docs.length - 1];
        if (lastDoc) {
          setPageSnapshots(prev => [...prev, lastDoc]);
        }
      }

      const newRecipes = recipeDocs.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date()
        };
      }) as Recipe[];

      setRecipes(newRecipes);
    } catch (error) {
      console.error('Error fetching recipes:', error);
      showPointsToast(0, 'Failed to fetch recipes');
    } finally {
      setLoading(false);
    }
  };

  // Function to generate page numbers array
  const getPageNumbers = () => {
    const pageNumbers: (number | string)[] = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      // Show all pages if total pages is less than max visible
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      // Always show first page
      pageNumbers.push(1);

      if (currentPage <= 3) {
        // Near the start
        pageNumbers.push(2, 3, 4, '...', totalPages);
      } else if (currentPage >= totalPages - 2) {
        // Near the end
        pageNumbers.push('...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        // Middle
        pageNumbers.push('...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
      }
    }

    return pageNumbers;
  };

  // Helper to check if a recipe is ready for a specific column
  const isRecipeReadyForColumn = (recipe: Recipe, column: ColumnType): boolean => {
    switch (column) {
      case 'classification':
        return true; // Classification can always be generated
      case 'summary':
        // Need classification data before generating summary
        return !!(recipe.cookingTime && recipe.cuisineType && recipe.cookingDifficulty && recipe.diet);
      case 'nutrition':
        // Need basic recipe data for nutrition
        return !!(recipe.ingredients?.length && recipe.directions?.length);
      case 'pairings':
        // Need basic recipe data for pairings
        return !!(recipe.ingredients?.length && recipe.directions?.length);
      default:
        return false;
    }
  };

  // Add this helper function to check if a step is ready
  const canProcessStep = (recipe: Recipe, step: string): boolean => {
    switch (step) {
      case 'details':
        return true; // Details can always be generated
      case 'classification':
        return !!(recipe.ingredients?.length && recipe.directions?.length);
      case 'summary':
        return !!(recipe.ingredients?.length && recipe.directions?.length &&
                  recipe.cookingTime && recipe.cuisineType && recipe.cookingDifficulty && recipe.diet);
      case 'nutrition':
        return !!(recipe.ingredients?.length && recipe.directions?.length);
      case 'pairings':
        return !!(recipe.ingredients?.length && recipe.directions?.length);
      default:
        return false;
    }
  };

  // Function to modernize a recipe
  const modernizeRecipe = async (recipe: Recipe) => {
    try {
      const neededStep = needsModernization(recipe);
      if (!neededStep) {
        showPointsToast(0, `Recipe ${recipe.recipeTitle} is already fully modernized`);
        return;
      }

      // Set loading state only for the current step
      setModernizingState(neededStep, recipe.id, true);
      let updatedRecipe = { ...recipe };

      // Generate recipe details based on the needed step
      const detailsResponse = await fetch("/api/generateRecipeDetails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipeTitle: updatedRecipe.recipeTitle,
          recipeContent: updatedRecipe.recipeContent,
          generateAll: false,
          generateStep: neededStep
        }),
      });

      let detailsData;
      try {
        detailsData = await detailsResponse.json();
      } catch (e) {
        throw new Error('Failed to parse API response: Invalid JSON');
      }

      if (!detailsResponse.ok) {
        const errorMessage = detailsData?.message || detailsData?.error || 'Failed to generate recipe details';
        throw new Error(errorMessage);
      }

      if (!detailsData || typeof detailsData !== 'object') {
        throw new Error('Invalid API response format');
      }

      // Update recipe based on the current step
      const updateData: any = {};
      let updatedFields = [];

      switch (neededStep) {
        case 'details':
          if (Array.isArray(detailsData.ingredients) && detailsData.ingredients.length &&
              Array.isArray(detailsData.directions) && detailsData.directions.length) {
            updateData.ingredients = detailsData.ingredients;
            updateData.directions = detailsData.directions;
            updateData.directionsCount = detailsData.directions.length;
            updatedFields.push('ingredients', 'directions');
          } else {
            throw new Error('Failed to generate recipe ingredients and directions');
          }
          break;

        case 'classification':
          if (detailsData.cuisineType) updateData.cuisineType = detailsData.cuisineType;
          if (detailsData.cookingDifficulty) updateData.cookingDifficulty = detailsData.cookingDifficulty;
          if (Array.isArray(detailsData.diet)) updateData.diet = detailsData.diet;
          if (detailsData.cookingTime) updateData.cookingTime = detailsData.cookingTime;
          updatedFields.push('classification details');
          break;

        case 'summary':
          if (detailsData.summary) {
            updateData.recipeSummary = detailsData.summary;
            updatedFields.push('summary');
          }
          break;

        case 'nutrition':
          if (detailsData.macroInfo) {
            updateData.macroInfo = detailsData.macroInfo;
            updatedFields.push('nutritional info');
          }
          break;

        case 'pairings':
          if (detailsData.dishPairings) {
            updateData.dishPairings = detailsData.dishPairings;
            updatedFields.push('dish pairings');
          }
          break;
      }

      // Update the recipe in database
      const recipeRef = doc(db, 'recipes', updatedRecipe.id);
      await updateDoc(recipeRef, updateData);

      // Update local state
      updatedRecipe = { ...updatedRecipe, ...updateData };
      setRecipes(prev => prev.map(r => r.id === updatedRecipe.id ? updatedRecipe : r));

      showPointsToast(0, `Updated ${updatedRecipe.recipeTitle} with: ${updatedFields.join(', ')}`);
    } catch (error) {
      console.error('Error modernizing recipe:', error);
      const errorMessage = error.message || 'Unknown error occurred';
      showPointsToast(0, `Failed to modernize recipe: ${errorMessage}`);
    } finally {
      // Clear loading state for the current step
      Object.keys(modernizingStates).forEach(step => {
        setModernizingState(step, recipe.id, false);
      });
    }
  };

  // Add these new functions for individual updates
  const generateBasicDetails = async (recipe: Recipe) => {
    try {
      setModernizingState('details', recipe.id, true);
      const response = await fetch("/api/generateRecipeDetails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipeTitle: recipe.recipeTitle,
          recipeContent: recipe.recipeContent,
          generateAll: false
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to generate recipe details');
      }

      const updatedRecipe = {
        ...recipe,
        ingredients: data.ingredients || recipe.ingredients,
        directions: data.directions || recipe.directions
      };

      await updateDoc(doc(db, 'recipes', recipe.id), {
        ingredients: updatedRecipe.ingredients,
        directions: updatedRecipe.directions
      });

      setRecipes(prev => prev.map(r => r.id === recipe.id ? updatedRecipe : r));
      if (!automation.isRunning) {
        showPointsToast(0, `Updated basic details for ${recipe.recipeTitle}`);
      }
    } catch (error) {
      console.error('Error generating details:', error);
      showPointsToast(0, `Failed to generate details: ${error.message}`);
    } finally {
      setModernizingState('details', recipe.id, false);
    }
  };

  // Update the generateClassification function to handle missing data
  const generateClassification = async (recipe: Recipe) => {
    try {
      // Check prerequisites
      if (!recipe.ingredients?.length || !recipe.directions?.length) {
        if (!automation.isRunning) {
          showPointsToast(0, `Please generate basic details for ${recipe.recipeTitle} first`);
        }
        return;
      }

      setModernizingState('classification', recipe.id, true);
      const response = await fetch("/api/classifyRecipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `${recipe.recipeTitle}\n\nIngredients:\n${recipe.ingredients.join('\n')}\n\nDirections:\n${recipe.directions.join('\n')}`
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to generate classification');
      }

      // Convert cooking_time to minutes for internal processing
      let minutes = 30; // default fallback
      if (typeof data.cooking_time === 'number') {
        minutes = data.cooking_time;
      } else if (typeof data.cooking_time === 'string') {
        // Handle string formats
        const timeString = data.cooking_time.toLowerCase();
        if (timeString.includes('hour')) {
          const hours = parseInt(timeString) || 1;
          minutes = hours * 60;
        } else if (timeString.includes('minute')) {
          minutes = parseInt(timeString) || 30;
        } else {
          // Try to parse just the number
          const number = parseInt(timeString);
          if (!isNaN(number)) {
            minutes = number;
          }
        }
      }

      // Convert minutes back to a formatted string
      let cookingTime: string;
      if (minutes >= 120) {
        cookingTime = '2 hours';
      } else if (minutes >= 60) {
        cookingTime = '1 hour';
      } else {
        cookingTime = `${minutes} minutes`;
      }

      const updatedRecipe = {
        ...recipe,
        cookingTime,
        cuisineType: data.cuisine,
        cookingDifficulty: data.difficulty,
        diet: data.diet || []
      };

      await updateDoc(doc(db, 'recipes', recipe.id), {
        cookingTime,
        cuisineType: data.cuisine,
        cookingDifficulty: data.difficulty,
        diet: data.diet || []
      });

      setRecipes(prev => prev.map(r => r.id === recipe.id ? updatedRecipe : r));
      if (!automation.isRunning) {
        showPointsToast(0, `Generated classification for ${recipe.recipeTitle}`);
      }
    } catch (error) {
      console.error('Error generating classification:', error);
      showPointsToast(0, `Failed to generate classification: ${error.message}`);
    } finally {
      setModernizingState('classification', recipe.id, false);
    }
  };

  const generateSummary = async (recipe: Recipe) => {
    try {
      setModernizingState('summary', recipe.id, true);
      const response = await fetch("/api/generateSummary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: recipe.recipeTitle,
          ingredients: recipe.ingredients,
          directions: recipe.directions,
          cuisineType: recipe.cuisineType,
          diet: recipe.diet,
          cookingTime: recipe.cookingTime,
          cookingDifficulty: recipe.cookingDifficulty
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to generate summary');
      }

      const updatedRecipe = {
        ...recipe,
        recipeSummary: data.summary
      };

      await updateDoc(doc(db, 'recipes', recipe.id), {
        recipeSummary: data.summary
      });

      setRecipes(prev => prev.map(r => r.id === recipe.id ? updatedRecipe : r));
      if (!automation.isRunning) {
        showPointsToast(0, `Generated summary for ${recipe.recipeTitle}`);
      }
    } catch (error) {
      console.error('Error generating summary:', error);
      showPointsToast(0, `Failed to generate summary: ${error.message}`);
    } finally {
      setModernizingState('summary', recipe.id, false);
    }
  };

  const generateMacroInfo = async (recipe: Recipe) => {
    try {
      setModernizingState('nutrition', recipe.id, true);
      const response = await fetch("/api/macroInfo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe: `${recipe.recipeTitle}\n\nIngredients:\n${recipe.ingredients.join('\n')}\n\nDirections:\n${recipe.directions.join('\n')}`
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to generate macro info');
      }

      const updatedRecipe = {
        ...recipe,
        macroInfo: data.macros
      };

      await updateDoc(doc(db, 'recipes', recipe.id), {
        macroInfo: data.macros
      });

      setRecipes(prev => prev.map(r => r.id === recipe.id ? updatedRecipe : r));
      if (!automation.isRunning) {
        showPointsToast(0, `Generated macro info for ${recipe.recipeTitle}`);
      }
    } catch (error) {
      console.error('Error generating macro info:', error);
      showPointsToast(0, `Failed to generate macro info: ${error.message}`);
    } finally {
      setModernizingState('nutrition', recipe.id, false);
    }
  };

  const generatePairings = async (recipe: Recipe) => {
    try {
      setModernizingState('pairings', recipe.id, true);
      const response = await fetch("/api/dishPairing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe: `${recipe.recipeTitle}\n\nIngredients:\n${recipe.ingredients.join('\n')}\n\nDirections:\n${recipe.directions.join('\n')}`
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to generate pairings');
      }

      const updatedRecipe = {
        ...recipe,
        dishPairings: data.suggestion
      };

      await updateDoc(doc(db, 'recipes', recipe.id), {
        dishPairings: data.suggestion
      });

      setRecipes(prev => prev.map(r => r.id === recipe.id ? updatedRecipe : r));
      if (!automation.isRunning) {
        showPointsToast(0, `Generated pairings for ${recipe.recipeTitle}`);
      }
    } catch (error) {
      console.error('Error generating pairings:', error);
      showPointsToast(0, `Failed to generate pairings: ${error.message}`);
    } finally {
      setModernizingState('pairings', recipe.id, false);
    }
  };

  // Add delete recipe function
  const handleDeleteRecipe = async (recipeId: string) => {
    if (!window.confirm('Are you sure you want to delete this recipe? This action cannot be undone.')) {
      return;
    }

    try {
      setDeletingId(recipeId);
      await deleteDoc(doc(db, 'recipes', recipeId));
      setRecipes(prev => prev.filter(r => r.id !== recipeId));
      setTotalRecipes(prev => prev - 1);
      showPointsToast(0, 'Recipe deleted successfully');
    } catch (error) {
      console.error('Error deleting recipe:', error);
      showPointsToast(0, 'Failed to delete recipe');
    } finally {
      setDeletingId(null);
    }
  };

  // Helper to check if a column is complete for current page
  const isColumnComplete = useCallback((column: ColumnType) => {
    return recipes.every(recipe => {
      switch (column) {
        case 'classification':
          return recipe.cookingTime && recipe.cuisineType && recipe.cookingDifficulty && recipe.diet;
        case 'summary':
          return recipe.recipeSummary;
        case 'nutrition':
          return recipe.macroInfo;
        case 'pairings':
          return recipe.dishPairings;
      }
    });
  }, [recipes]);

  // Helper to get next column
  const getNextColumn = (current: ColumnType): ColumnType | null => {
    const columns: ColumnType[] = ['classification', 'summary', 'nutrition', 'pairings'];
    const currentIndex = columns.indexOf(current);
    return currentIndex < columns.length - 1 ? columns[currentIndex + 1] : null;
  };

  // Function to process current column
  const processColumn = useCallback(async () => {
    if (!automation.isRunning || loading) return;

    // Process recipes that need work in current column
    const recipesToProcess = recipes.filter(recipe => {
      // Skip if recipe is already being processed
      if (automation.processingRecipes.has(recipe.id)) return false;

      // First check if the recipe needs basic details
      if (!recipe.ingredients?.length || !recipe.directions?.length) {
        return true; // This recipe needs basic details first
      }

      // Then check if it needs the current column's processing
      switch (automation.currentColumn) {
        case 'classification':
          return !recipe.cookingTime || !recipe.cuisineType || !recipe.cookingDifficulty || !recipe.diet;
        case 'summary':
          return !recipe.recipeSummary && canProcessStep(recipe, 'summary');
        case 'nutrition':
          return !recipe.macroInfo && canProcessStep(recipe, 'nutrition');
        case 'pairings':
          return !recipe.dishPairings && canProcessStep(recipe, 'pairings');
        default:
          return false;
      }
    });

    // If no recipes to process in current column
    if (recipesToProcess.length === 0) {
      const nextColumn = getNextColumn(automation.currentColumn);
      if (nextColumn) {
        // Move to next column on same page
        setAutomation(prev => ({
          ...prev,
          currentColumn: nextColumn,
          processingRecipes: new Set()
        }));
      } else if (currentPage < totalPages) {
        // Move to next page
        setCurrentPage(prev => prev + 1);
      } else {
        // All done!
        setAutomation(prev => ({
          ...prev,
          isRunning: false
        }));
      }
      return;
    }

    // Process the first recipe that needs work
    const recipeToProcess = recipesToProcess[0];

    // Add to processing set before starting
    const newProcessingSet = new Set(automation.processingRecipes);
    newProcessingSet.add(recipeToProcess.id);
    setAutomation(prev => ({
      ...prev,
      processingRecipes: newProcessingSet
    }));

    try {
      // Check if recipe needs basic details first
      if (!recipeToProcess.ingredients?.length || !recipeToProcess.directions?.length) {
        await generateBasicDetails(recipeToProcess);
        return; // Exit and let the next cycle handle the next step
      }

      // Process the recipe based on current column
      switch (automation.currentColumn) {
        case 'classification':
          await generateClassification(recipeToProcess);
          break;
        case 'summary':
          if (canProcessStep(recipeToProcess, 'summary')) {
            await generateSummary(recipeToProcess);
          }
          break;
        case 'nutrition':
          if (canProcessStep(recipeToProcess, 'nutrition')) {
            await generateMacroInfo(recipeToProcess);
          }
          break;
        case 'pairings':
          if (canProcessStep(recipeToProcess, 'pairings')) {
            await generatePairings(recipeToProcess);
          }
          break;
      }
    } catch (error) {
      console.log(`Error processing ${recipeToProcess.recipeTitle}:`, error);
    } finally {
      // Remove from processing set after completion
      const updatedProcessingSet = new Set(automation.processingRecipes);
      updatedProcessingSet.delete(recipeToProcess.id);
      setAutomation(prev => ({
        ...prev,
        processingRecipes: updatedProcessingSet
      }));
    }
  }, [automation.isRunning, automation.currentColumn, automation.processingRecipes, recipes, currentPage, totalPages, loading]);

  // Effect to run automation
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    if (automation.isRunning && !loading) {
      // Add a small delay between processing attempts to prevent rapid updates
      timeoutId = setTimeout(() => {
        processColumn();
      }, 1000);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [automation.isRunning, loading, processColumn]);

  // Effect to handle page changes
  useEffect(() => {
    if (automation.isRunning) {
      const loadPage = async () => {
        setLoading(true);
        await fetchRecipes(currentPage);
        // Reset to classification column whenever we load a new page
        setAutomation(prev => ({
          ...prev,
          currentColumn: 'classification',
          processingRecipes: new Set()
        }));
        setLoading(false);
      };
      loadPage();
    }
  }, [currentPage, automation.isRunning]);

  // Initial fetch
  useEffect(() => {
    const initialFetch = async () => {
      await fetchRecipes(1);
      await fetchTotalCount();
    };
    initialFetch();
  }, []);

  return (
    <div className="bg-white rounded-xl p-4 md:p-6 mb-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div>
          <h2 className="text-xl font-semibold">Recipe Modernizer</h2>
          <p className="text-sm text-gray-600 mt-1">
            Showing {recipes.length} of {totalRecipes} recipes missing directions
          </p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => {
              fetchRecipes();
              fetchTotalCount();
            }}
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <FontAwesomeIcon icon={faSync} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => setAutomation(prev => ({
              ...prev,
              isRunning: !prev.isRunning,
              currentColumn: 'classification',
              currentPage: 1,
              processingRecipes: new Set()
            }))}
            className={`flex-1 md:flex-none px-3 py-1.5 text-sm rounded-lg transition-colors ${
              automation.isRunning
                ? 'bg-red-100 text-red-600 hover:bg-red-200'
                : 'bg-green-100 text-green-600 hover:bg-green-200'
            }`}
          >
            {automation.isRunning ? '⏹️ Stop Agent' : '▶️ Start Agent'}
          </button>

          {automation.isRunning && (
            <span className="hidden md:inline text-sm text-gray-600">
              Processing {automation.currentColumn}
              {automation.processingRecipes.size > 0 && ` (${automation.processingRecipes.size} active)`}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {recipes.map((recipe) => (
          <div
            key={recipe.id}
            className="border rounded-lg p-3 flex flex-col md:flex-row items-start md:items-center gap-3 hover:bg-gray-50 transition-colors"
          >
            <div className="w-full md:w-[250px] flex-shrink-0">
              <a
                href={`/recipe/${recipe.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-600 hover:text-blue-800 hover:underline block truncate"
              >
                {recipe.recipeTitle}
              </a>
            </div>

            <div className="flex flex-wrap gap-2 flex-1">
              <button
                onClick={() => generateBasicDetails(recipe)}
                disabled={Object.values(modernizingStates).some(set => set.has(recipe.id))}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  isModernizing('details', recipe.id)
                    ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-600'
                    : (!recipe.ingredients?.length || !recipe.directions?.length)
                      ? 'bg-red-100 text-red-600 hover:bg-red-200 cursor-pointer hover:scale-105'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer hover:scale-105'
                }`}
              >
                {isModernizing('details', recipe.id)
                  ? 'Updating...'
                  : (!recipe.ingredients?.length || !recipe.directions?.length)
                    ? 'No Details'
                    : 'Try Details Again'}
              </button>

              <button
                onClick={() => generateClassification(recipe)}
                disabled={Object.values(modernizingStates).some(set => set.has(recipe.id)) || !canProcessStep(recipe, 'classification')}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  !canProcessStep(recipe, 'classification')
                    ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-600'
                    : isModernizing('classification', recipe.id)
                      ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-600'
                      : (!recipe.cookingTime || !recipe.cuisineType || !recipe.cookingDifficulty || !recipe.diet)
                        ? 'bg-purple-100 text-purple-600 hover:bg-purple-200 cursor-pointer hover:scale-105'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer hover:scale-105'
                }`}
              >
                {isModernizing('classification', recipe.id)
                  ? 'Updating...'
                  : !canProcessStep(recipe, 'classification')
                    ? 'Need Details First'
                    : (!recipe.cookingTime || !recipe.cuisineType || !recipe.cookingDifficulty || !recipe.diet)
                      ? 'No Classification'
                      : 'Try Classification Again'}
              </button>

              <button
                onClick={() => generateSummary(recipe)}
                disabled={Object.values(modernizingStates).some(set => set.has(recipe.id)) || !canProcessStep(recipe, 'summary')}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  !canProcessStep(recipe, 'summary')
                    ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-600'
                    : isModernizing('summary', recipe.id)
                      ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-600'
                      : !recipe.recipeSummary
                        ? 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200 cursor-pointer hover:scale-105'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer hover:scale-105'
                }`}
              >
                {isModernizing('summary', recipe.id)
                  ? 'Updating...'
                  : !canProcessStep(recipe, 'summary')
                    ? 'Need Classification First'
                    : !recipe.recipeSummary
                      ? 'No Summary'
                      : 'Try Summary Again'}
              </button>

              <button
                onClick={() => generateMacroInfo(recipe)}
                disabled={Object.values(modernizingStates).some(set => set.has(recipe.id)) || !canProcessStep(recipe, 'nutrition')}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  !canProcessStep(recipe, 'nutrition')
                    ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-600'
                    : isModernizing('nutrition', recipe.id)
                      ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-600'
                      : !recipe.macroInfo
                        ? 'bg-green-100 text-green-600 hover:bg-green-200 cursor-pointer hover:scale-105'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer hover:scale-105'
                }`}
              >
                {isModernizing('nutrition', recipe.id)
                  ? 'Updating...'
                  : !canProcessStep(recipe, 'nutrition')
                    ? 'Need Details First'
                    : !recipe.macroInfo
                      ? 'No Nutrition'
                      : 'Try Nutrition Again'}
              </button>

              <button
                onClick={() => generatePairings(recipe)}
                disabled={Object.values(modernizingStates).some(set => set.has(recipe.id)) || !canProcessStep(recipe, 'pairings')}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  !canProcessStep(recipe, 'pairings')
                    ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-600'
                    : isModernizing('pairings', recipe.id)
                      ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-600'
                      : !recipe.dishPairings
                        ? 'bg-blue-100 text-blue-600 hover:bg-blue-200 cursor-pointer hover:scale-105'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer hover:scale-105'
                }`}
              >
                {isModernizing('pairings', recipe.id)
                  ? 'Updating...'
                  : !canProcessStep(recipe, 'pairings')
                    ? 'Need Details First'
                    : !recipe.dishPairings
                      ? 'No Pairings'
                      : 'Try Pairings Again'}
              </button>
            </div>

            <button
              onClick={() => handleDeleteRecipe(recipe.id)}
              disabled={deletingId === recipe.id}
              className={`w-full md:w-auto px-2 py-1 text-sm rounded transition-colors
                ${deletingId === recipe.id
                  ? 'opacity-50 cursor-not-allowed bg-gray-100 text-gray-600'
                  : 'bg-red-100 text-red-600 hover:bg-red-200 cursor-pointer hover:scale-105'
                }`}
            >
              {deletingId === recipe.id ? '...' : '🗑️ Delete'}
            </button>
          </div>
        ))}

        {recipes.length === 0 && !loading && (
          <div className="text-center py-6 text-gray-500 text-sm">
            No recipes found missing directions.
          </div>
        )}
      </div>

      {loading && (
        <div className="flex justify-center my-4">
          <LoadingSpinner />
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-6">
          <button
            onClick={() => fetchRecipes(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="mr-1" />
            Previous
          </button>

          {getPageNumbers().map((pageNum, index) => (
            <React.Fragment key={index}>
              {pageNum === '...' ? (
                <span className="px-3 py-2">...</span>
              ) : (
                <button
                  onClick={() => fetchRecipes(pageNum as number)}
                  className={`px-3 py-2 rounded-lg transition-colors ${
                    currentPage === pageNum
                      ? 'bg-black text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {pageNum}
                </button>
              )}
            </React.Fragment>
          ))}

          <button
            onClick={() => fetchRecipes(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
            <FontAwesomeIcon icon={faArrowRight} className="ml-1" />
          </button>
        </div>
      )}
    </div>
  );
};

export default RecipeModernizer;