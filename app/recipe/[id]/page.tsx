"use client"; // This marks this file as a client component

import { useParams, useRouter } from "next/navigation"; // Use useParams and useRouter for navigation
import { db, storage } from "../../lib/backend/client"; // Import database db and storage
import { doc, getDoc, deleteDoc, updateDoc, query, getDocs, collection, where, addDoc, serverTimestamp, arrayUnion, increment, Timestamp, orderBy, limit } from "../../lib/backend/database"; // database methods
import { ref, uploadBytes, getDownloadURL, deleteObject } from "../../lib/backend/storage";
import { useEffect, useState, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { getAuth } from "../../lib/backend/auth"; // Import local backend auth
import Image from "next/image";
import { RecipeChatBubble } from "../../components/RecipeChatBubble";
import { SidebarLayout } from "../../components/SidebarLayout";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { useDeleteRecipe } from "../../context/DeleteRecipeContext";
import { usePoints } from '../../context/PointsContext';
import { SpoonPointSystem } from '../../lib/spoonPoints';
import { useAuth } from '../../context/AuthContext';
import { RecipeHeader } from "../components/RecipeHeader";
import { RecipeImage } from "../components/RecipeImage";
import { RecipeNavigation } from "../components/RecipeNavigation";
import { RecipeFooter } from "../components/RecipeFooter";
import { RecipeCard } from "../../components/RecipeCard";
import { Recipe } from "../types";
import { RecipeIngredients } from "../components/RecipeIngredients";
import { RecipeDirections } from "../components/RecipeDirections";
import { RecipeNotes } from "../components/RecipeNotes";
import { RecipeMacros } from "../components/RecipeMacros";
import { RecipePairings } from "../components/RecipePairings";
import { RecipeTitle } from "../components/RecipeTitle";
import { RecipeSummary } from "../components/RecipeSummary";
import {
  generateImageHash,
  verifyImageContent,
  checkImageSimilarity,
  checkRecipeImageLimit,
  checkPreviousAnalyses
} from '../../lib/imageUtils';
import { isAdmin } from '../../config/admin';

const shimmer = (w: number, h: number) => `
<svg width="${w}" height="${h}" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="g">
      <stop stop-color="#fef3c7" offset="0%" />
      <stop stop-color="#fde68a" offset="50%" />
      <stop stop-color="#fef3c7" offset="100%" />
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="#fef3c7" />
  <rect id="r" width="${w}" height="${h}" fill="url(#g)" />
  <animate xlink:href="#r" attributeName="x" from="-${w}" to="${w}" dur="1s" repeatCount="indefinite" />
</svg>`;

const toBase64 = (str: string) =>
  typeof window === 'undefined'
    ? Buffer.from(str).toString('base64')
    : window.btoa(str);

const POINTS_FOR_LIKE = 50; // Points awarded when someone likes your recipe

/** Notes feature hidden from UI (data preserved). Set to true to re-enable. */
const SHOW_NOTES = false;

const RecipeDetails = () => {
  const [recipe, setRecipe] = useState<Recipe | null>(null); // State to store the recipe details
  const [checkedDirections, setCheckedDirections] = useState<boolean[]>([]); // Track checked directions
  const [checkedIngredients, setCheckedIngredients] = useState<boolean[]>([]); // Track checked ingredients
  const [isOwner, setIsOwner] = useState(false); // Check if the current user owns the recipe
  const [loadingImage, setLoadingImage] = useState(false);
  const [loadingTitle, setLoadingTitle] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingMacros, setLoadingMacros] = useState(false);
  const [loadingPairings, setLoadingPairings] = useState(false);
  const [loadingIngredientsDirections, setLoadingIngredientsDirections] = useState(false);
  const [loadingPinAction, setLoadingPinAction] = useState(false);
  const [loadingDeleteAction, setLoadingDeleteAction] = useState(false);
  const [loadingRegenerateTags, setLoadingRegenerateTags] = useState(false);
  const [macroInfo, setMacroInfo] = useState(null);
  const [dishPairings, setDishPairings] = useState("");
  const { id } = useParams();
  const router = useRouter(); // Use useRouter for redirection
  const auth = getAuth();
  const [imageError, setImageError] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [partialImageUrl, setPartialImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [hasNoteChanges, setHasNoteChanges] = useState(false);
  const [activeSection, setActiveSection] = useState('ingredients');
  const ingredientsRef = useRef(null);
  const directionsRef = useRef(null);
  const notesRef = useRef(null);
  const macroInfoRef = useRef(null);
  const pairingsRef = useRef(null);
  const scrollByClickRef = useRef(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const { showDeletePopup } = useDeleteRecipe();
  const { user } = useAuth();
  const { showPointsToast } = usePoints();
  const [currentUsername, setCurrentUsername] = useState<string>('');
  const [isUserAdmin, setIsUserAdmin] = useState(false);
  const [similarRecipes, setSimilarRecipes] = useState<Recipe[]>([]);
  const [similarRecipesLoading, setSimilarRecipesLoading] = useState(false);

  useEffect(() => {
    if (!id) return; // If no id, do nothing

    const fetchRecipe = async () => {
      try {
        const recipeDocRef = doc(db, "recipes", id as string);
        const recipeDoc = await getDoc(recipeDocRef);

        if (recipeDoc.exists()) {
          const data = recipeDoc.data();

          // Safely handle missing data
          const directions = Array.isArray(data.directions) ? data.directions : [];
          const ingredients = Array.isArray(data.ingredients) ? data.ingredients : [];

          setRecipe({
            id: recipeDoc.id,
            recipeTitle: data.recipeTitle || "No title",
            recipeContent: data.recipeContent || "No content",
            userId: data.userId || "",
            cuisineType: data.cuisineType || "Unknown",
            cookingDifficulty: data.cookingDifficulty || "Unknown",
            cookingTime: data.cookingTime || "Unknown",
            diet: data.diet || [],
            directions: directions,
            ingredients: ingredients,
            imageURL: data.imageURL || "",
            imageUpdatedAt: data.imageUpdatedAt ?? null,
            recipeSummary: data.recipeSummary || "",
            recipeNotes: data.recipeNotes || "",
            macroInfo: data.macroInfo || null,
            dishPairings: data.dishPairings || "",
            pinned: data.pinned || false,
            lastPinnedAt: data.lastPinnedAt || null,
            likes: data.likes || [],
            username: data.username || "Anonymous Chef"
          });
          setNotes(data.recipeNotes || "");
          // Set the states from saved data if they exist
          if (data.macroInfo) setMacroInfo(data.macroInfo);
          if (data.dishPairings) setDishPairings(data.dishPairings);

          // Check if the current user is the owner of the recipe
          const currentUser = auth.currentUser;
          if (currentUser && currentUser.uid === data.userId) {
            setIsOwner(true);
          }

          // Initialize the checkedDirections and checkedIngredients state
          setCheckedDirections(new Array(directions.length).fill(false));
          setCheckedIngredients(new Array(ingredients.length).fill(false));
        } else {
          // console.log("No such recipe!");
        }
      } catch (error) {
        console.error("Error fetching recipe:", error);
      }
    };

    fetchRecipe();
  }, [id, auth]);

  // Fetch similar recipes (database: recent recipes, prefer same cuisine)
  useEffect(() => {
    if (!recipe || !id) return;

    const fetchSimilarRecipes = async () => {
      setSimilarRecipesLoading(true);
      try {
        const recipesQuery = query(
          collection(db, "recipes"),
          orderBy("createdAt", "desc"),
          limit(25)
        );
        const snapshot = await getDocs(recipesQuery);
        const allRecipes = snapshot.docs
          .filter((d) => d.id !== id)
          .map((d) => {
            const data = d.data();
            const directions = Array.isArray(data.directions) ? data.directions : [];
            const ingredients = Array.isArray(data.ingredients) ? data.ingredients : [];
            return {
              id: d.id,
              recipeTitle: data.recipeTitle || "No title",
              recipeContent: "",
              userId: data.userId || "",
              cuisineType: data.cuisineType || "Unknown",
              cookingDifficulty: data.cookingDifficulty || "Unknown",
              cookingTime: data.cookingTime || "Unknown",
              diet: data.diet || [],
              directions,
              ingredients,
              imageURL: data.imageURL || "",
              recipeSummary: data.recipeSummary || "",
              recipeNotes: data.recipeNotes || "",
              macroInfo: data.macroInfo || null,
              dishPairings: data.dishPairings || "",
              pinned: data.pinned || false,
              lastPinnedAt: data.lastPinnedAt || null,
              likes: data.likes || [],
              username: data.username || "Anonymous Chef",
            } as Recipe;
          });

        const cuisine = recipe.cuisineType || "Unknown";
        const similar = allRecipes
          .sort((a, b) => {
            const aMatch = a.cuisineType === cuisine ? 1 : 0;
            const bMatch = b.cuisineType === cuisine ? 1 : 0;
            return bMatch - aMatch;
          })
          .slice(0, 4);

        const userIds = new Set(similar.map((r) => r.userId).filter(Boolean));
        const userMap = new Map<string, string>();
        if (userIds.size > 0) {
          const usersQuery = query(
            collection(db, "users"),
            where("__name__", "in", Array.from(userIds).slice(0, 10))
          );
          const userDocs = await getDocs(usersQuery);
          userDocs.docs.forEach((d) => userMap.set(d.id, d.data().username || "Anonymous Chef"));
        }

        const withUsernames = similar.map((r) => ({
          ...r,
          username: userMap.get(r.userId) || "Anonymous Chef",
        }));

        setSimilarRecipes(withUsernames);
      } catch (error) {
        console.error("Error fetching similar recipes:", error);
        setSimilarRecipes([]);
      } finally {
        setSimilarRecipesLoading(false);
      }
    };

    fetchSimilarRecipes();
  }, [recipe, id]);

  // Scroll detection - update active tab as user scrolls (skip during programmatic scroll from click)
  useEffect(() => {
    const handleScroll = () => {
      if (scrollByClickRef.current) return;

      const sections = [
        { id: 'ingredients', ref: ingredientsRef },
        { id: 'directions', ref: directionsRef },
        ...(SHOW_NOTES ? [{ id: 'notes' as const, ref: notesRef }] : []),
        { id: 'macros', ref: macroInfoRef },
        { id: 'pairings', ref: pairingsRef }
      ];

      const threshold = 180; // Account for sticky nav height (scroll-mt-44 = 176px)

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        if (section.ref.current) {
          const rect = section.ref.current.getBoundingClientRect();
          if (rect.top <= threshold) {
            setActiveSection(section.id);
            return;
          }
        }
      }
      setActiveSection('ingredients');
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (ref: React.RefObject<HTMLDivElement>, sectionId: string) => {
    setActiveSection(sectionId);
    scrollByClickRef.current = true;
    setTimeout(() => { scrollByClickRef.current = false; }, 900);
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Function to toggle the checkmark for directions
  const toggleDirectionCheck = (index: number) => {
    const updatedCheckedDirections = [...checkedDirections];
    updatedCheckedDirections[index] = !updatedCheckedDirections[index];
    setCheckedDirections(updatedCheckedDirections);
  };

  // Function to toggle the checkmark for ingredients
  const toggleIngredientCheck = (index: number) => {
    const updatedCheckedIngredients = [...checkedIngredients];
    updatedCheckedIngredients[index] = !updatedCheckedIngredients[index];
    setCheckedIngredients(updatedCheckedIngredients);
  };

  // Function to delete the recipe
  const handleDelete = async () => {
    if (!id || !recipe || typeof id !== 'string') return;

    showDeletePopup(id, recipe.recipeTitle, async () => {
      try {
        setLoadingDeleteAction(true);
        await deleteDoc(doc(db, "recipes", id));
        router.push("/recipes");
      } catch (error) {
        console.error("Error deleting recipe:", error);
        showPointsToast(0, "Failed to delete recipe. Please try again.");
      } finally {
        setLoadingDeleteAction(false);
      }
    });
  };

  // Function to generate a new recipe image using streaming (partial results → final)
  const handleGenerateImage = async () => {
    if (!recipe || !id || !user) return;

    setLoadingImage(true);
    setPartialImageUrl(null);
    try {
        const actionCheck = await SpoonPointSystem.isActionAvailable(
            user.uid,
            'GENERATE_IMAGE',
            id as string
        );

        // If points can't be awarded, show a toast but continue with generation
        if (!actionCheck.available) {
            showPointsToast(0, actionCheck.reason === 'Action already performed on this target'
                ? "You won't earn points this time since you've already generated an image for this recipe!"
                : actionCheck.reason === 'Daily limit reached'
                ? "You've reached your daily limit! You can still generate images, but no points will be awarded."
                : "You can generate the image, but no points will be awarded at this time.");
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s for streaming

        const response = await fetch("/api/generateImageStream", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                prompt: `A dish of ${recipe.recipeTitle}`,
                userId: user.uid,
                recipeId: id
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok || !response.body) {
            showPointsToast(0, "Failed to generate image. Please try again.");
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.type === "partial" && data.b64) {
                            setPartialImageUrl(`data:image/png;base64,${data.b64}`);
                        } else if (data.type === "final" && data.imageUrl) {
                            setPartialImageUrl(null);
                            const ts = Date.now();
                            const recipeDocRef = doc(db, "recipes", id as string);
                            await updateDoc(recipeDocRef, { imageURL: data.imageUrl, imageUpdatedAt: ts });
                            const cacheBustedUrl = `${data.imageUrl}${data.imageUrl.includes('?') ? '&' : '?'}_t=${ts}`;
                            setIsImageLoading(true);
                            setRecipe((prevRecipe) => prevRecipe && { ...prevRecipe, imageURL: cacheBustedUrl, imageUpdatedAt: ts });

                            if (actionCheck.available) {
                                const pointsResult = await SpoonPointSystem.awardPoints(
                                    user.uid,
                                    'GENERATE_IMAGE',
                                    id as string
                                );
                                if (pointsResult.success) {
                                    showPointsToast(pointsResult.points!, 'Recipe image generated!');
                                }
                            }
                        } else if (data.type === "error") {
                            showPointsToast(0, data.message || "Failed to generate image");
                        }
                    } catch {
                        // ignore parse errors for incomplete chunks
                    }
                }
            }
        }

        if (buffer.startsWith("data: ")) {
            try {
                const data = JSON.parse(buffer.slice(6));
                if (data.type === "error") {
                    showPointsToast(0, data.message || "Failed to generate image");
                }
            } catch {
                // ignore
            }
        }

        setPartialImageUrl(null);
    } catch (error) {
        console.error("Error generating image:", error);
        setPartialImageUrl(null);
        if (error instanceof Error && error.name === 'AbortError') {
            showPointsToast(0, "Image generation took too long. Please try again.");
        } else {
            showPointsToast(0, "Failed to generate image. Please try again later.");
        }
    } finally {
        setLoadingImage(false);
    }
  };

  // Function to handle image deletion
  const handleDeleteImage = async () => {
    if (!id || !recipe?.imageURL) return;

    try {
      // Try both paths: generateImage saves as .png, uploads may use no extension
      const pathsToTry = [`recipe-images/${id}.png`, `recipe-images/${id}`];
      for (const path of pathsToTry) {
        try {
          await deleteObject(ref(storage, path));
          break;
        } catch (storageError: any) {
          if (storageError?.code === "storage/object-not-found" || storageError?.message?.includes("404")) {
            continue;
          }
          console.warn("Storage delete failed for", path, storageError);
        }
      }

      // Update database to remove the image URL and clear cache timestamp
      const recipeDocRef = doc(db, "recipes", id as string);
      await updateDoc(recipeDocRef, { imageURL: "", imageUpdatedAt: null });

      // 4. Update local state
      setRecipe((prevRecipe) => prevRecipe && { ...prevRecipe, imageURL: "", imageUpdatedAt: null });
      setImageError(false);
    } catch (error) {
      console.error("Error deleting image:", error);
    }
  };

  // Add new function to handle image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !id || !recipe || !user) return;

    setUploadingImage(true);
    const file = e.target.files[0];

    try {
      // 1. Verify image content type
      const contentCheck = await verifyImageContent(file);
      if (!contentCheck.isValid) {
        setUploadingImage(false);
        showPointsToast(0, contentCheck.message || "Invalid image format");
        return;
      }

      // 2. Generate hash of the image
      const imageHash = await generateImageHash(file);

      // 3. Check if this hash exists in database
      const hashCheckQuery = query(
        collection(db, "imageHashes"),
        where("hash", "==", imageHash)
      );
      const hashCheckSnapshot = await getDocs(hashCheckQuery);

      if (!hashCheckSnapshot.empty) {
        setUploadingImage(false);
        showPointsToast(0, "This image has already been uploaded before!");
        return;
      }

      // 4. Check image similarity with user's recent uploads
      const isSimilarityValid = await checkImageSimilarity(imageHash, user.uid);
      if (!isSimilarityValid) {
        setUploadingImage(false);
        showPointsToast(0, "This image is too similar to one of your recent uploads");
        return;
      }

      // 5. Check recipe image limit
      const recipeImageCheck = await checkRecipeImageLimit(id as string);
      if (!recipeImageCheck.isValid) {
        setUploadingImage(false);
        showPointsToast(0, recipeImageCheck.message || "Maximum images reached");
        return;
      }

      // 6. Check previous analyses
      const analysisCheck = await checkPreviousAnalyses(imageHash);
      if (!analysisCheck.isValid) {
        setUploadingImage(false);
        showPointsToast(0, analysisCheck.message || "Image previously rejected");
        return;
      }

      // Create a reference to the storage location
      const storageRef = ref(storage, `recipe-images/${id}`);

      // Upload the file
      await uploadBytes(storageRef, file);

      // Get the download URL
      const downloadURL = await getDownloadURL(storageRef);

      // Store the image hash in database
      await addDoc(collection(db, "imageHashes"), {
        hash: imageHash,
        userId: user.uid,
        recipeId: id,
        timestamp: serverTimestamp(),
      });

      const ts = Date.now();
      // Update database with the new image URL and timestamp for cache-busting on refresh
      const recipeDocRef = doc(db, "recipes", id as string);
      await updateDoc(recipeDocRef, { imageURL: downloadURL, imageUpdatedAt: ts });

      // Cache-bust for display so browser fetches fresh image after overwrite
      const cacheBustedUrl = `${downloadURL}${downloadURL.includes('?') ? '&' : '?'}_t=${ts}`;
      setRecipe((prevRecipe) => prevRecipe && { ...prevRecipe, imageURL: cacheBustedUrl, imageUpdatedAt: ts });
      setImageError(false);
      setIsImageLoading(true);

      // Analyze the uploaded photo and award points
      try {
        console.log("📸 Sending photo for analysis...");
        const analysisResponse = await fetch("/api/analyzeRecipePhoto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl: downloadURL,
            imageHash,
            recipe: {
              recipeTitle: recipe.recipeTitle,
              ingredients: recipe.ingredients,
              directions: recipe.directions
            }
          }),
        });

        console.log("📨 Analysis response status:", analysisResponse.status);
        const responseText = await analysisResponse.text();
        console.log("📝 Raw response:", responseText);

        if (analysisResponse.ok) {
          const analysis = JSON.parse(responseText);
          console.log("✅ Parsed analysis result:", analysis);

          if (analysis.score === 0) {
            console.log("⚠️ Image unrelated to recipe");
            showPointsToast(0, analysis.explanation);

            // Store the failed analysis result
            await addDoc(collection(db, "imageAnalyses"), {
              imageHash,
              score: 0,
              explanation: analysis.explanation,
              timestamp: serverTimestamp()
            });
          } else {
            console.log("🎯 Valid image score:", analysis.score);
            // Award points based on the analysis score
            const pointsResult = await SpoonPointSystem.awardPoints(
              user.uid,
              'UPLOAD_IMAGE',
              id as string,
              { score: analysis.score }
            );

            // Store the successful analysis result
            await addDoc(collection(db, "imageAnalyses"), {
              imageHash,
              score: analysis.score,
              timestamp: serverTimestamp()
            });

            console.log("🎉 Points award result:", pointsResult);

            if (pointsResult.success) {
              showPointsToast(analysis.score, `Photo quality: ${analysis.score} points!`);
            } else {
              console.log("⚠️ No points awarded:", pointsResult.error);
              showPointsToast(0, "Already uploaded a photo for this recipe");
            }
          }
        } else {
          console.error("❌ Failed to analyze photo:", responseText);
          showPointsToast(0, "Failed to analyze photo");
        }
      } catch (error) {
        console.error("❌ Error in photo analysis:", error);
        showPointsToast(0, "Error analyzing photo");
      }
    } catch (error) {
      console.error("Error uploading image:", error);
    } finally {
      setUploadingImage(false);
    }
  };

  // Add function to handle saving notes
  const handleSaveNotes = async () => {
    if (!id) return;
    setSavingNotes(true);
    try {
      const recipeDocRef = doc(db, "recipes", id as string);
      await updateDoc(recipeDocRef, { recipeNotes: notes });
      setRecipe(prev => prev ? { ...prev, recipeNotes: notes } : null);
    } catch (error) {
      console.error("Error saving notes:", error);
    } finally {
      setSavingNotes(false);
    }
  };

  // Modify the notes change handler
  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setNotes(newValue);
    setHasNoteChanges(newValue !== recipe?.recipeNotes);
  };

  const calculateProgress = () => {
    if (!recipe) return { ingredients: 0, directions: 0 };

    const ingredientsProgress = checkedIngredients.filter(Boolean).length / recipe.ingredients.length * 100;
    const directionsProgress = checkedDirections.filter(Boolean).length / recipe.directions.length * 100;

    return {
      ingredients: ingredientsProgress,
      directions: directionsProgress
    };
  };

  // Function to handle points award
  const handlePointsAward = async (actionType: string, targetId: string, message: string) => {
    if (!user) return;

    const result = await SpoonPointSystem.awardPoints(user.uid, actionType, targetId);
    if (result.success) {
      showPointsToast(result.points!, message);
    }
  };

  // Update the generateSummary function
  const generateSummary = async () => {
    if (!recipe || !user || typeof id !== 'string') return;

    setLoadingSummary(true);
    try {
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
          cookingDifficulty: recipe.cookingDifficulty,
        }),
      });

      const data = await response.json();
      if (response.ok && data.summary) {
        const recipeRef = doc(db, "recipes", id);
        await updateDoc(recipeRef, { recipeSummary: data.summary });
        setRecipe((prev) => (prev ? { ...prev, recipeSummary: data.summary } : null));

        // Award points for generating summary (skip for admin - they're fixing others' recipes)
        if (!isUserAdmin) {
          await handlePointsAward(
            'GENERATE_SUMMARY',
            id,
            'Recipe summary generated!'
          );
        }
      } else if (!response.ok && data.error) {
        showPointsToast(0, data.error);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to generate summary';
      showPointsToast(0, msg);
    } finally {
      setLoadingSummary(false);
    }
  };

  // Update the handleMacroCalculation function
  const handleMacroCalculation = async () => {
    if (!recipe || !user || typeof id !== 'string') return;

    setLoadingMacros(true);
    try {
      const response = await fetch("/api/macroInfo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe: `${recipe.recipeTitle}\nIngredients:\n${recipe.ingredients.join("\n")}\nDirections:\n${recipe.directions.join("\n")}`,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.macros) {
          // Save to database
          const recipeRef = doc(db, "recipes", id);
          await updateDoc(recipeRef, { macroInfo: data.macros });

          // Update local state
          setMacroInfo(data.macros);
          setRecipe(prev => prev ? { ...prev, macroInfo: data.macros } : null);
        }

        // Award points (skip for admin)
        if (!isUserAdmin) {
          await handlePointsAward(
            'GENERATE_NUTRITION',
            id,
            'Nutritional information calculated!'
          );
        }
      }
    } catch (error) {
      console.error("Error calculating macros:", error);
    } finally {
      setLoadingMacros(false);
    }
  };

  // Regenerate tags (cuisine, time, difficulty, diet) - owner or admin
  const handleRegenerateTags = async () => {
    if (!recipe || !id || typeof id !== 'string' || (!isOwner && !isUserAdmin)) return;

    setLoadingRegenerateTags(true);
    try {
      const message = [
        `Recipe: ${recipe.recipeTitle}`,
        `Ingredients:\n${(recipe.ingredients || []).join('\n')}`,
        `Directions:\n${(recipe.directions || []).join('\n')}`
      ].join('\n\n');

      const response = await fetch("/api/classifyRecipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const data = await response.json();

      if (!response.ok) {
        showPointsToast(0, data.error || "Failed to classify recipe");
        return;
      }

      // Map cooking_time from classify format to explore filter format
      const timeMap: Record<string, string> = {
        "15 minutes": "15 min",
        "30 minutes": "30 min",
        "45 minutes": "45 min",
        "1 hour": "1 hour",
        "2 hours": "1.5 hours",
      };
      const cookingTime = timeMap[data.cooking_time] || data.cooking_time;

      const recipeRef = doc(db, "recipes", id);
      const updates = {
        cuisineType: data.cuisine || recipe.cuisineType,
        cookingTime: cookingTime || recipe.cookingTime,
        cookingDifficulty: (data.difficulty || recipe.cookingDifficulty)?.toLowerCase() || recipe.cookingDifficulty,
        diet: Array.isArray(data.diet) ? data.diet : (recipe.diet || []),
      };

      await updateDoc(recipeRef, updates);
      setRecipe((prev) =>
        prev ? { ...prev, ...updates } : null
      );

      if (!isUserAdmin) {
        await handlePointsAward("GENERATE_TAGS", id, "Recipe tags updated!");
      }
    } catch (error) {
      console.error("Error regenerating tags:", error);
      showPointsToast(0, "Failed to regenerate tags. Please try again.");
    } finally {
      setLoadingRegenerateTags(false);
    }
  };

  // Regenerate ingredients and directions (admin only)
  const handleRegenerateIngredientsDirections = async () => {
    if (!recipe || !id || typeof id !== 'string' || !isUserAdmin) return;

    setLoadingIngredientsDirections(true);
    try {
      const response = await fetch("/api/generateRecipeDetails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipeTitle: recipe.recipeTitle,
          recipeContent: recipe.recipeContent || '',
          generateAll: false,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ingredients?.length && data.directions?.length) {
          const recipeRef = doc(db, "recipes", id);
          await updateDoc(recipeRef, {
            ingredients: data.ingredients,
            directions: data.directions,
          });
          setRecipe(prev => prev ? {
            ...prev,
            ingredients: data.ingredients,
            directions: data.directions,
          } : null);
          setCheckedIngredients(new Array(data.ingredients.length).fill(false));
          setCheckedDirections(new Array(data.directions.length).fill(false));
        }
      }
    } catch (error) {
      console.error("Error regenerating ingredients/directions:", error);
    } finally {
      setLoadingIngredientsDirections(false);
    }
  };

  // Update the handleGetPairings function
  const handleGetPairings = async () => {
    if (!recipe || !user || typeof id !== 'string') return;

    setLoadingPairings(true);
    try {
      const response = await fetch("/api/dishPairing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe: recipe.recipeTitle }),
      });

      if (response.ok) {
        const data = await response.json();

        if (data.suggestion) {  // API returns suggestion, not pairings
          // Save to database
          const recipeRef = doc(db, "recipes", id);
          await updateDoc(recipeRef, { dishPairings: data.suggestion });

          // Update local state
          setDishPairings(data.suggestion);
          setRecipe(prev => prev ? { ...prev, dishPairings: data.suggestion } : null);

          // Award points (skip for admin)
          if (!isUserAdmin) {
            await handlePointsAward(
              'GENERATE_PAIRINGS',
              id,
              'Perfect pairings discovered!'
            );
          }
        }
      }
    } catch (error) {
      console.error("Error getting pairings:", error);
    } finally {
      setLoadingPairings(false);
    }
  };

  // Add click outside handler for menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Function to handle pinning/unpinning
  const handlePinToggle = async () => {
    if (!id || (!isOwner && !isUserAdmin)) return;
    try {
      setLoadingPinAction(true);
      const recipeDocRef = doc(db, "recipes", id as string);
      const newPinnedState = !recipe?.pinned;

      // Update database with consistent property names
      await updateDoc(recipeDocRef, {
        pinned: newPinnedState,
        lastPinnedAt: newPinnedState ? new Date().toISOString() : null
      });

      // Update local state
      setRecipe(prev => prev ? {
        ...prev,
        pinned: newPinnedState,
        lastPinnedAt: newPinnedState ? new Date().toISOString() : null
      } : null);
    } catch (error) {
      console.error("Error toggling pin status:", error);
    } finally {
      setLoadingPinAction(false);
    }
  };

  // Function to copy recipe URL to clipboard
  const handleCopyRecipe = () => {
    if (!recipe) return;

    const recipeUrl = `https://www.babaselo.com/recipe/${id}`;

    navigator.clipboard.writeText(recipeUrl).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
      setShowMenu(false);
    });
  };

  const handleGenerateTitle = async () => {
    if (!recipe || !id || typeof id !== 'string') return;

    setLoadingTitle(true);
    try {
      const response = await fetch("/api/generateTitle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ingredients: recipe.ingredients,
          directions: recipe.directions,
          cuisineType: recipe.cuisineType,
          diet: recipe.diet,
          recipeId: id,
        }),
      });

      const data = await response.json();
      if (data.title) {
        const recipeRef = doc(db, "recipes", id);
        await updateDoc(recipeRef, { recipeTitle: data.title });
        setRecipe(prev => prev ? { ...prev, recipeTitle: data.title } : null);
      }
    } catch (error) {
      console.error("Error generating title:", error);
    } finally {
      setLoadingTitle(false);
    }
  };

  // Add function to fetch current username
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
    fetchCurrentUsername();
  }, [user]);

  // Add handleLike function
  const handleLike = async () => {
    if (!user || !recipe) return;

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

      // Update local state
      setRecipe(prev => prev ? {
        ...prev,
        likes: [...(prev.likes || []), user.uid]
      } : null);

      // Award points to recipe owner if it's not their own recipe
      if (recipe.userId !== user.uid) {
        const spoonRef = doc(db, "spoonPoints", recipe.userId);
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
      }
    } catch (error) {
      console.error("Error updating like:", error);
    }
  };

  const handleLikeSimilar = async (likedRecipe: Recipe) => {
    if (!user) return;
    try {
      const recipeRef = doc(db, "recipes", likedRecipe.id);
      const currentLikes = likedRecipe.likes || [];
      if (currentLikes.includes(user.uid)) return;

      await updateDoc(recipeRef, { likes: arrayUnion(user.uid) });
      setSimilarRecipes(prev =>
        prev.map(r =>
          r.id === likedRecipe.id
            ? { ...r, likes: [...(r.likes || []), user.uid] }
            : r
        )
      );

      if (likedRecipe.userId !== user.uid) {
        const spoonRef = doc(db, "spoonPoints", likedRecipe.userId);
        await updateDoc(spoonRef, {
          totalPoints: increment(POINTS_FOR_LIKE),
          transactions: arrayUnion({
            actionType: "RECIPE_SAVED_BY_OTHER",
            points: POINTS_FOR_LIKE,
            timestamp: Timestamp.now(),
            targetId: likedRecipe.id,
            details: `Recipe "${likedRecipe.recipeTitle}" liked by @${currentUsername}`
          })
        });
      }
    } catch (error) {
      console.error("Error updating like:", error);
    }
  };

  // Add admin check effect
  useEffect(() => {
    const checkAdminStatus = async () => {
        if (user) {
            const adminStatus = await isAdmin(user.uid);
            setIsUserAdmin(adminStatus);
        } else {
            setIsUserAdmin(false);
        }
    };

    checkAdminStatus();
  }, [user]);

  return (
    <SidebarLayout>
    <div className="min-h-screen bg-[var(--background)] py-8 px-4">
      {recipe ? (
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-md p-6">
          <RecipeTitle
            recipe={recipe}
            isOwner={isOwner}
            isUserAdmin={isUserAdmin}
            loadingTitle={loadingTitle}
            handleGenerateTitle={handleGenerateTitle}
          />

          <RecipeSummary
            recipe={recipe}
            isOwner={isOwner}
            isUserAdmin={isUserAdmin}
            loadingSummary={loadingSummary}
            generateSummary={generateSummary}
          />

          <RecipeHeader
            recipe={recipe}
            isOwner={isOwner}
            isUserAdmin={isUserAdmin}
            copySuccess={copySuccess}
            handleCopyRecipe={handleCopyRecipe}
            handlePinToggle={handlePinToggle}
            handleDelete={handleDelete}
            handleLike={handleLike}
            handleRegenerateTags={handleRegenerateTags}
            loadingRegenerateTags={loadingRegenerateTags}
            currentUser={user}
            loadingPinAction={loadingPinAction}
            loadingDeleteAction={loadingDeleteAction}
          />

          <RecipeImage
            recipe={recipe}
            isOwner={isOwner}
            isUserAdmin={isUserAdmin}
            isImageLoading={isImageLoading}
            imageError={imageError}
            loadingImage={loadingImage}
            partialImageUrl={partialImageUrl}
            uploadingImage={uploadingImage}
            handleGenerateImage={handleGenerateImage}
            handleDeleteImage={handleDeleteImage}
            handleImageUpload={handleImageUpload}
            setIsImageLoading={setIsImageLoading}
            setImageError={setImageError}
            shimmer={shimmer}
            toBase64={toBase64}
          />

          {/* Navigation - at top so always visible, click to jump to section */}
          <RecipeNavigation
            activeSection={activeSection}
            ingredientsProgress={calculateProgress().ingredients}
            directionsProgress={calculateProgress().directions}
            scrollToSection={scrollToSection}
            ingredientsRef={ingredientsRef}
            directionsRef={directionsRef}
            notesRef={notesRef}
            macroInfoRef={macroInfoRef}
            pairingsRef={pairingsRef}
            showNotes={SHOW_NOTES}
          />

          <RecipeIngredients
            recipe={recipe}
            checkedIngredients={checkedIngredients}
            toggleIngredientCheck={toggleIngredientCheck}
            ingredientsRef={ingredientsRef}
            isUserAdmin={isUserAdmin}
            loadingIngredientsDirections={loadingIngredientsDirections}
            handleRegenerateIngredientsDirections={handleRegenerateIngredientsDirections}
          />

          <RecipeDirections
            recipe={recipe}
            checkedDirections={checkedDirections}
            toggleDirectionCheck={toggleDirectionCheck}
            directionsRef={directionsRef}
          />

          {SHOW_NOTES && (
            <RecipeNotes
              recipe={recipe}
              isOwner={isOwner}
              isUserAdmin={isUserAdmin}
              notes={notes}
              savingNotes={savingNotes}
              hasNoteChanges={hasNoteChanges}
              notesRef={notesRef}
              setNotes={setNotes}
              setHasNoteChanges={setHasNoteChanges}
              handleSaveNotes={handleSaveNotes}
            />
          )}

          <RecipeMacros
            recipe={recipe}
            isOwner={isOwner}
            isUserAdmin={isUserAdmin}
            loadingMacros={loadingMacros}
            macroInfoRef={macroInfoRef}
            handleMacroCalculation={handleMacroCalculation}
          />

          <RecipePairings
            recipe={recipe}
            isOwner={isOwner}
            isUserAdmin={isUserAdmin}
            loadingPairings={loadingPairings}
            pairingsRef={pairingsRef}
            handleGetPairings={handleGetPairings}
          />

          {/* Add the chat bubble with adjusted positioning and higher z-index */}
          <div className="relative mb-8 md:mb-6">
            <div className="fixed bottom-0 right-0 w-[25%] md:w-auto md:relative md:bottom-auto md:right-auto z-50">
              <RecipeChatBubble
                recipeContent={`Title: ${recipe.recipeTitle}

Cuisine Type: ${recipe.cuisineType}
Cooking Time: ${recipe.cookingTime}
Difficulty: ${recipe.cookingDifficulty}
Diet: ${recipe.diet.join(', ')}

Ingredients:
${recipe.ingredients.map((ingredient, index) => `${index + 1}. ${ingredient}`).join('\n')}

Directions:
${recipe.directions.map((direction, index) => `${index + 1}. ${direction}`).join('\n')}
`}
              />
            </div>
          </div>

          {/* Similar Recipes */}
          {(similarRecipesLoading || similarRecipes.length > 0) && (
            <div className="mt-12 pt-8 border-t border-amber-100">
              <h2 className="text-xl font-semibold text-amber-900/90 mb-6">Similar Recipes</h2>
              {similarRecipesLoading ? (
                <div className="grid grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="rounded-xl bg-amber-50/50 animate-pulse h-48" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {similarRecipes.map((similar) => (
                    <RecipeCard
                      key={similar.id}
                      recipe={similar}
                      onLike={handleLikeSimilar}
                      currentUser={user}
                      showUsername={true}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          <RecipeFooter />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <img src="/baba-removebg.png" alt="Baba" className="w-32 h-32 mb-6" />
          <LoadingSpinner className="scale-100" />
        </div>
      )}
    </div>
    </SidebarLayout>
  );
};

export default RecipeDetails;