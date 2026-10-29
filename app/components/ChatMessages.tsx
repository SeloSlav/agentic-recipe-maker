"use client";

import React, { useEffect, useState, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { FALLBACK_FUN_FACTS } from "../lib/meal-plan/mealPlanFacts";

/** User message indicates they're ready to generate (not just giving a preference like "mediterranean") */
function isUserReadyToGenerate(userContent: string): boolean {
    const lower = (userContent || "").toLowerCase().trim();
    const confirmPhrases = [
        "create it", "go ahead", "that's all", "that is all", "that's it", "that is it",
        "nothing else", "ready", "i'm ready", "make it", "make my plan", "create my plan",
        "create the plan", "make the plan", "let's do it", "lets do it",
        "sounds good", "sounds great", "yes", "yep", "ok", "okay",
        "do it", "create", "make", "yes please", "yes go ahead",
        "no that's all", "no that is all", "no that's it", "no that is it",
        "you decide", "your choice", "surprise me", "up to you", "whatever you prefer",
    ];
    return confirmPhrases.some((p) => lower.includes(p) || lower === p);
}
import { faUtensils, faFaceSmile, faHeart, faLeaf, faClock, faCalendarDays, faSun } from "@fortawesome/free-solid-svg-icons";
import { getAuth, onAuthStateChanged } from "../lib/backend/auth";
import { LoadingSpinner } from "./LoadingSpinner";
import { MessageRenderer } from "./MessageRenderer";
import { Message, RecipeClassification } from "./types";
import { parseRecipe, isRecipe } from "./messageUtils";
import type { NutritionalInfo } from "./types";
import { SpoonPointSystem } from "../lib/spoonPoints";

function str(content: string | NutritionalInfo): string {
    return typeof content === "string" ? content : "";
}
import { usePoints } from '../context/PointsContext';

interface MealPlanProgress {
    recipeIndex: number;
    totalRecipes: number;
    recipeName: string;
    dayName: string;
    completedDays: number;
    timeSlot: string;
}

interface ChatMessagesProps {
    messages: Message[];
    loading: boolean;
    setLoading: (isLoading: boolean) => void;
    onSuggestionClick: (suggestion: string) => void;
    onAssistantResponse: (assistantMsg: string | import('./types').NutritionalInfo, recipeLinks?: { name: string; recipeId: string; url: string }[]) => void;
    /** When true, show meal plan loader (from backend tool_started event). Overrides heuristic. */
    isGeneratingMealPlan?: boolean;
    /** Progress during meal plan generation (recipe X of Y, day, etc.) */
    mealPlanProgress?: MealPlanProgress | null;
}

// Function to extract and format food items
const formatDishPairings = async (text: string): Promise<string> => {
    try {
        const response = await fetch('/api/extractFoodItems', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });

        if (!response.ok) throw new Error('Failed to extract food items');

        const data = await response.json();

        // Check if items exists in the response
        if (!data || !Array.isArray(data.items)) {
            console.warn('Invalid response format from API:', data);
            return text;
        }

        // Sort items by length (longest first) to handle overlapping matches
        const sortedItems = data.items.sort((a, b) => b.length - a.length);

        // Replace each food item with its bold version, using word boundaries
        let formattedText = text;
        sortedItems.forEach(item => {
            if (typeof item === 'string') {
                const regex = new RegExp(`\\b${item}\\b`, 'gi');
                formattedText = formattedText.replace(regex, `**${item}**`);
            }
        });

        return formattedText;
    } catch (error) {
        console.error('Error formatting dish pairings:', error);
        return text;
    }
};

// Function to create a simple hash of the recipe content
const createRecipeHash = (content: string): string => {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36); // Convert to base36 for shorter hash
};

export const ChatMessages: React.FC<ChatMessagesProps> = ({
    messages,
    loading,
    setLoading,
    onSuggestionClick,
    onAssistantResponse,
    isGeneratingMealPlan: isGeneratingMealPlanFromBackend = false,
    mealPlanProgress: mealPlanProgressFromBackend = null,
}) => {
    const [recipeClassification, setRecipeClassification] = useState<Record<number, RecipeClassification | null>>({});
    const [formattedPairings, setFormattedPairings] = useState<Record<number, string>>({});
    const [mealPlanFunFacts, setMealPlanFunFacts] = useState<string[]>([]);
    const [mealPlanFunFactIndex, setMealPlanFunFactIndex] = useState(0);
    const bottomRef = useRef<HTMLDivElement | null>(null);
    const [userId, setUserId] = useState<string>("");
    const lastAssistantRef = useRef<HTMLDivElement | null>(null);
    const { showPointsToast } = usePoints();

    useEffect(() => {
        const auth = getAuth();
        const unsubscribe = onAuthStateChanged(auth, user => {
             if (user) {
                setUserId(user.uid);
             } else {
                setUserId("");
             }
        });
        return () => unsubscribe(); // Clean up listener on unmount
    }, []);

    useEffect(() => {
        if (lastAssistantRef.current) {
            lastAssistantRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, [messages]);

    const handleSaveRecipe = async (msg: string, classification: RecipeClassification | null) => {
        setLoading(true);
        const auth = getAuth();
        const currentUser = auth.currentUser;

        if (!currentUser) { // Check currentUser directly
            onAssistantResponse(`Oh dear, I see you'd like to save this wonderful recipe! 🤗 But first, you'll need to <a href="/login" class="underline text-amber-600 hover:text-amber-700">continue with Google</a> to get set up. That way, I can keep all your recipes safe and organized in your personal recipe vault! Plus, you'll earn special spoon points for each recipe you save. Shall we get you set up, dear? 👩‍🍳✨`);
            setLoading(false);
            return;
        }

        let idToken;
        try {
            idToken = await currentUser.getSessionToken();
        } catch (error) {
            console.error("Error getting ID token:", error);
            onAssistantResponse("Sorry, couldn't verify your session. Please try logging in again.");
            setLoading(false);
            return;
        }

        try {
            const { title } = parseRecipe(msg);
            // Use the verified UID from currentUser
            const docId = currentUser.uid + "-" + Date.now();
            const recipeHash = createRecipeHash(msg); // Keep using msg for hash if needed

            const response = await fetch("/api/saveRecipe", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    // Add the Authorization header
                    "Authorization": `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    recipeContent: msg,
                    // No need to send userId in body anymore, backend uses token
                    cuisineType: classification?.cuisine || "Croatian",
                    cookingDifficulty: classification?.difficulty || "Medium",
                    cookingTime: classification?.cooking_time || "2 hours",
                    diet: classification?.diet || ["gluten-free", "paleo"],
                    docId, // Send the generated docId
                    // recipeHash, // Decide if backend still needs this
                }),
            });

            if (response.ok) {
                // Award spoon points for saving the recipe (Ensure currentUser.uid is used)
                const pointsResult = await SpoonPointSystem.awardPoints(
                    currentUser.uid, // Use verified UID
                    'SAVE_RECIPE',
                    docId
                );

                let message = `Your <a href="/recipe/${docId}" target="_blank" rel="noopener noreferrer" class="underline text-amber-600 hover:text-amber-700"> ${title}</a> recipe has been tucked away in the kitchen vault, ready for use!`;

                if (pointsResult.success) {
                    showPointsToast(pointsResult.points!, 'Recipe saved successfully!');
                    message += ` You earned ${pointsResult.points} spoons! 🥄✨ Click your recipe to add mouthwatering photos, discover perfect pairings, and unlock more rewards!`;
                } else if (pointsResult.error) {
                    console.log('Points not awarded for save:', pointsResult.error);
                }

                onAssistantResponse(message);
            } else {
                const errorData = await response.json();
                console.error("Failed to save recipe:", errorData.error);
                 // Provide specific feedback based on status code if possible
                if (response.status === 401) {
                     onAssistantResponse("Sorry, your session seems invalid. Please log in again.");
                } else if (response.status === 403) {
                     onAssistantResponse("Sorry, permission denied saving the recipe. You might not own it if it already exists.");
                } else {
                     onAssistantResponse("Sorry, something went wrong saving the recipe.");
                }
            }
        } catch (error) {
            console.error("Error in handleSaveRecipe fetch/processing:", error);
            onAssistantResponse("Sorry, an unexpected error occurred while saving the recipe.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const handleNewRecipe = async (content: string, lastAssistantIndex: number) => {
            try {
                const recipeHash = createRecipeHash(content);

                const response = await fetch("/api/classifyRecipe", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ message: content }),
                });
                if (response.ok) {
                    const data = await response.json();
                    setRecipeClassification(prev => ({ ...prev, [lastAssistantIndex]: data }));
                } else {
                    setRecipeClassification(prev => ({ ...prev, [lastAssistantIndex]: null }));
                }
            } catch (error) {
                console.error("Error handling new recipe:", error);
                setRecipeClassification(prev => ({ ...prev, [lastAssistantIndex]: null }));
            }
        };

        const lastAssistantIndex = messages
            .map((m, i) => (m.role === "assistant" ? i : -1))
            .filter(i => i !== -1)
            .pop();

        if (lastAssistantIndex !== undefined && lastAssistantIndex !== -1) {
            const msg = messages[lastAssistantIndex];
            if (isRecipe(msg.content)) {
                handleNewRecipe(msg.content, lastAssistantIndex);
            }
        }
    }, [messages, showPointsToast]); // Removed userId, createRecipeHash dependencies as they are stable

    // Fetch and cycle fun facts during meal plan generation in chat
    useEffect(() => {
        if (!loading) {
            setMealPlanFunFacts([]);
            setMealPlanFunFactIndex(0);
            return;
        }
        if (messages.length < 2) return;
        const lastMsg = messages[messages.length - 1];
        const prevMsg = messages[messages.length - 2];
        const prevContent = (typeof prevMsg?.content === "string" ? prevMsg.content : "").toLowerCase();
        const inMealPlanConvo =
            lastMsg?.role === "user" &&
            prevMsg?.role === "assistant" &&
            (prevContent.includes("plan your week") ||
                prevContent.includes("meal plan") ||
                prevContent.includes("plan my meals") ||
                (prevContent.includes("tell me") &&
                    (prevContent.includes("diet") ||
                        prevContent.includes("cuisines") ||
                        prevContent.includes("ingredients"))) ||
                prevContent.includes("anything else") ||
                prevContent.includes("make your plan"));
        const isMealPlanFlow = isGeneratingMealPlanFromBackend || (inMealPlanConvo && isUserReadyToGenerate(str(lastMsg?.content ?? "")));
        if (!isMealPlanFlow) return;

        setMealPlanFunFactIndex(0);
        setMealPlanFunFacts([]);

        const preferences = str(lastMsg?.content ?? "").trim();
        fetch("/api/meal-plan/fun-facts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ preferences: preferences || undefined, type: "weekly" }),
        })
            .then((r) => r.json())
            .then((d) => (d.facts?.length ? d.facts : []))
            .catch(() => [])
            .then((facts) => facts.length > 0 && setMealPlanFunFacts(facts));
    }, [loading, messages, isGeneratingMealPlanFromBackend]);

    // Cycle through fun facts while meal plan is generating
    useEffect(() => {
        if (!loading) return;
        const lastMsg = messages[messages.length - 1];
        const prevMsg = messages[messages.length - 2];
        const prevContent = (typeof prevMsg?.content === "string" ? prevMsg.content : "").toLowerCase();
        const inMealPlanConvo =
            messages.length >= 2 &&
            lastMsg?.role === "user" &&
            prevMsg?.role === "assistant" &&
            (prevContent.includes("plan your week") ||
                prevContent.includes("meal plan") ||
                prevContent.includes("plan my meals") ||
                (prevContent.includes("tell me") &&
                    (prevContent.includes("diet") ||
                        prevContent.includes("cuisines") ||
                        prevContent.includes("ingredients"))) ||
                prevContent.includes("anything else") ||
                prevContent.includes("make your plan"));
        const isMealPlanFlow = isGeneratingMealPlanFromBackend || (inMealPlanConvo && isUserReadyToGenerate(str(lastMsg?.content ?? "")));
        if (!isMealPlanFlow) return;

        const facts = mealPlanFunFacts.length > 0 ? mealPlanFunFacts : FALLBACK_FUN_FACTS;
        if (facts.length === 0) return;
        const interval = setInterval(() => {
            setMealPlanFunFactIndex((i) => (i + 1) % facts.length);
        }, 6000);
        return () => clearInterval(interval);
    }, [loading, messages, mealPlanFunFacts.length, isGeneratingMealPlanFromBackend]);

    useEffect(() => {
        messages.forEach((msg, index) => {
            if (msg.role === "assistant" &&
                typeof msg.content === "string" &&
                (msg.content.includes("pairing") || msg.content.includes("complement")) &&
                !formattedPairings[index]) {
                formatDishPairings(msg.content).then(formatted => {
                    setFormattedPairings(prev => ({
                        ...prev,
                        [index]: formatted
                    }));
                });
            }
        });
    }, [messages, formattedPairings]);

    const suggestions: { text: string; icon: React.ReactNode }[] = [
        { text: "I'd like a traditional Balkan recipe", icon: <FontAwesomeIcon icon={faUtensils} className="w-3 h-3 text-amber-700/80 shrink-0" /> },
        { text: "What's your secret to perfect homemade meals?", icon: <FontAwesomeIcon icon={faUtensils} className="w-3 h-3 text-amber-700/80 shrink-0" /> },
        { text: "Tell me a funny story from the kitchen", icon: <FontAwesomeIcon icon={faFaceSmile} className="w-3 h-3 text-amber-700/80 shrink-0" /> },
        { text: "Give me a recipe for a romantic dinner", icon: <FontAwesomeIcon icon={faHeart} className="w-3 h-3 text-amber-700/80 shrink-0" /> },
        { text: "Tell me about SELO olive oil", icon: <FontAwesomeIcon icon={faLeaf} className="w-3 h-3 text-amber-700/80 shrink-0" /> },
        { text: "Can you set a timer for 15 minutes?", icon: <FontAwesomeIcon icon={faClock} className="w-3 h-3 text-amber-700/80 shrink-0" /> },
        { text: "What's in season right now?", icon: <FontAwesomeIcon icon={faSun} className="w-3 h-3 text-amber-700/80 shrink-0" /> },
        { text: "Help me plan my meals for the week", icon: <FontAwesomeIcon icon={faCalendarDays} className="w-3 h-3 text-amber-700/80 shrink-0" /> },
        { text: "What should I cook for dinner tonight?", icon: <FontAwesomeIcon icon={faUtensils} className="w-3 h-3 text-amber-700/80 shrink-0" /> },
    ];

    const [firstMessage, ...restMessages] = messages;

    return (
        <div className="w-full max-w-2xl mx-auto px-0 md:px-4 space-y-4">
            {firstMessage && firstMessage.role === "assistant" && (
                <div className="flex flex-wrap gap-1.5 mt-4">
                    {suggestions.map((suggestion, i) => (
                        <button
                            key={i}
                            onClick={() => onSuggestionClick(suggestion.text)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm bg-white rounded-lg hover:bg-amber-50 text-gray-800 font-medium text-left border border-amber-200 hover:border-amber-300 shadow-sm hover:shadow transition-all"
                        >
                            {suggestion.icon}
                            <span>{suggestion.text}</span>
                        </button>
                    ))}
                </div>
            )}

            {restMessages.map((msg, index) => {
                const actualIndex = index + 1;
                const isLastItem = actualIndex === restMessages.length;
                const isAssistant = msg.role === "assistant";
                const messageRef = isAssistant && isLastItem ? lastAssistantRef : null;

                    return (
                    <MessageRenderer
                        key={actualIndex}
                        message={msg}
                        index={actualIndex}
                        messageRef={messageRef}
                        recipeClassification={recipeClassification[actualIndex]}
                        formattedPairings={formattedPairings}
                        onSuggestionClick={onSuggestionClick}
                        onAssistantResponse={onAssistantResponse}
                        setLoading={setLoading}
                        handleSaveRecipe={handleSaveRecipe}
                    />
                );
            })}

            {loading && (() => {
                const lastMsg = messages[messages.length - 1];
                const prevMsg = messages[messages.length - 2];
                const prevContent = (typeof prevMsg?.content === "string" ? prevMsg.content : "").toLowerCase();
                const inMealPlanConvo = messages.length >= 2 &&
                    lastMsg?.role === "user" &&
                    prevMsg?.role === "assistant" &&
                    (prevContent.includes("plan your week") || prevContent.includes("meal plan") || prevContent.includes("plan my meals") ||
                     (prevContent.includes("tell me") && (prevContent.includes("diet") || prevContent.includes("cuisines") || prevContent.includes("ingredients"))) ||
                     prevContent.includes("anything else") || prevContent.includes("make your plan"));
                const isMealPlanFlow = isGeneratingMealPlanFromBackend || (inMealPlanConvo && isUserReadyToGenerate(str(lastMsg?.content ?? "")));
                const loadingLabel = isMealPlanFlow ? "Generating your meal plan now..." : null;
                const displayFacts = mealPlanFunFacts.length > 0 ? mealPlanFunFacts : FALLBACK_FUN_FACTS;
                const currentFact = displayFacts[mealPlanFunFactIndex % displayFacts.length] || displayFacts[0];
                return (
                    <div className="flex justify-start">
                        <div className="bg-white rounded-3xl px-4 py-3 flex flex-col gap-2 max-w-md">
                            <div className="flex items-center gap-3">
                                <LoadingSpinner />
                                {loadingLabel && <span className="text-sm text-gray-600">{loadingLabel}</span>}
                            </div>
                            {isMealPlanFlow && mealPlanProgressFromBackend && mealPlanProgressFromBackend.totalRecipes > 0 && (
                                <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-100 text-left">
                                    <p className="text-xs font-medium text-amber-900 mb-1">
                                        Recipe {mealPlanProgressFromBackend.recipeIndex} of {mealPlanProgressFromBackend.totalRecipes}
                                    </p>
                                    <p className="text-gray-700 text-xs truncate" title={mealPlanProgressFromBackend.recipeName}>
                                        {mealPlanProgressFromBackend.dayName} · {mealPlanProgressFromBackend.timeSlot}: {mealPlanProgressFromBackend.recipeName}
                                    </p>
                                    {mealPlanProgressFromBackend.completedDays > 0 && (
                                        <p className="text-xs text-amber-700 mt-1">
                                            {mealPlanProgressFromBackend.completedDays} day{mealPlanProgressFromBackend.completedDays !== 1 ? "s" : ""} complete
                                        </p>
                                    )}
                                    <div className="mt-2 h-1 bg-amber-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-amber-500 rounded-full transition-all duration-300"
                                            style={{ width: `${(mealPlanProgressFromBackend.recipeIndex / mealPlanProgressFromBackend.totalRecipes) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                            {isMealPlanFlow && (
                                <p className="text-gray-500 text-xs">
                                    This may take a minute or two. You can leave this chat and find your plan in Meal Plans later if you&apos;re busy—otherwise wait right here, dear!
                                </p>
                            )}
                            {isMealPlanFlow && currentFact && (
                                <>
                                    <p key={mealPlanFunFactIndex} className="text-gray-600 text-sm leading-relaxed italic">
                                        &ldquo;{currentFact}&rdquo;
                                    </p>
                                    <p className="text-amber-600 text-xs font-medium">— Baba Selo</p>
                                </>
                            )}
                        </div>
                    </div>
                );
            })()}
            <div ref={bottomRef}></div>
        </div>
    );
};
