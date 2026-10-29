"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { db } from "../lib/backend/client";
import { doc, getDoc, updateDoc, setDoc } from "../lib/backend/database";
import { LoadingSpinner } from '../components/LoadingSpinner';
import { SidebarLayout } from '../components/SidebarLayout';
import { validateUsername } from '../lib/usernameValidation';

// Image style options—platform & vibe focused (photorealistic-recipe is default)
const imageStyleOptions = {
  "photorealistic-recipe": {
    name: "Photorealistic Recipe",
    description: "Real photo—authentic, appetizing. Universal default.",
    prompt: "Photorealistic food photograph. Natural lighting, authentic styling, realistic textures. Professional food photography—genuine and appetizing. No artificial or exaggerated elements."
  },
  "instagram-flatlay": {
    name: "Instagram Flat-Lay",
    description: "Top-down, clean aesthetic. Instagram & Pinterest feed staple.",
    prompt: "Overhead flat-lay food photography for Instagram. Bird's-eye view, clean composition, minimal props, marble or wood surface. Soft natural light, shallow depth of field. Aesthetic, fresh, organized, highly shareable."
  },
  "bright-viral": {
    name: "Bright & Viral",
    description: "TikTok & Reels—vibrant, punchy, made to stop the scroll.",
    prompt: "Viral social media food photography. Bright punchy lighting, saturated colors, slight 45° angle. Steam rising if applicable. Fresh, eye-catching, thumbnail-worthy. The kind of food shot that gets saved and shared."
  },
  "dark-moody": {
    name: "Dark & Moody",
    description: "Instagram food blogger—dramatic, editorial, sophisticated.",
    prompt: "Dark moody food photography. Deep shadows, dramatic side lighting, dark charcoal or black background. Sophisticated, atmospheric. Rich colors, fine dining editorial. Moody food blogger aesthetic."
  },
  "pinterest-cozy": {
    name: "Pinterest Cozy",
    description: "Warm, aspirational—recipe blog & Pinterest dream.",
    prompt: "Cozy Pinterest-style food photography. Warm natural light, kitchen or dining table setting. Steam rising, casual plating, linen napkin or wooden cutting board. Aspirational but approachable. Recipe blog aesthetic."
  },
  "minimalist-white": {
    name: "Minimalist White",
    description: "Clean white—restaurant menu, premium, elegant.",
    prompt: "Minimalist food photography on pure white background. Clean elegant plating, soft diffused lighting, no distractions. Sophisticated—like a high-end restaurant menu or cookbook cover."
  },
  "golden-hour": {
    name: "Golden Hour",
    description: "Warm sunset glow—romantic, fine dining, date-night vibes.",
    prompt: "Food photography in golden hour lighting. Warm sunset glow through window, soft shadows, romantic restaurant ambiance. Dish bathed in amber light. Elegant, inviting, magazine-quality."
  },
  "street-food": {
    name: "Street Food",
    description: "Casual, authentic—paper plates, market stall, unpretentious.",
    prompt: "Authentic street food photography. Casual setting—paper plate, market stall, or food truck. Natural daylight, unpretentious plating. Real, approachable, the way food actually looks when you buy it. No fancy styling."
  },
  "vintage-retro": {
    name: "Vintage Retro",
    description: "70s/80s cookbook—faded, nostalgic, unique.",
    prompt: "Vintage 1970s-80s cookbook food photography. Slightly faded warm tones, retro styling, old-fashioned plating. Nostalgic charm—like a well-loved recipe card from grandma's kitchen."
  },
  "whimsical-cartoon": {
    name: "Whimsical Cartoon",
    description: "Playful illustration—Studio Ghibli charm, fun & different.",
    prompt: "IMPORTANT: This must be a 2D animated illustration, NOT a photograph. Whimsical cartoon food art. Bright cheerful colors, smooth rounded shapes, hand-drawn style. Studio Ghibli or Pixar-inspired charm. Playful, friendly, inviting—like food from an animated film. No realism."
  }
} as const;

type ImageStyle = keyof typeof imageStyleOptions;

// Map deprecated style keys to current ones (for users who had old styles saved)
const styleMigration: Record<string, ImageStyle> = {
  "overhead-flatlay": "instagram-flatlay",
  "cozy-kitchen": "pinterest-cozy",
  "vintage-recipe": "vintage-retro",
  "rustic-traditional": "pinterest-cozy",
  "modern-cookbook": "minimalist-white",
  "social-snap": "bright-viral",
};

export default function SettingsPage() {
  const { user, loading } = useAuth();

  // Local state
  const [username, setUsername] = useState<string>("");
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([]);
  const [preferredCookingOil, setPreferredCookingOil] = useState<string>("");
  const [preferredImageStyle, setPreferredImageStyle] = useState<ImageStyle>("photorealistic-recipe");
  const [plan, setPlan] = useState<"free" | "pro">("free");

  // For handling the auto-complete filters
  const [dietarySearch, setDietarySearch] = useState("");
  const [oilSearch, setOilSearch] = useState("");

  // Show/Hide dropdown states
  const [showDietaryDropdown, setShowDietaryDropdown] = useState(false);
  const [showOilDropdown, setShowOilDropdown] = useState(false);

  // Save states
  const [isSaving, setIsSaving] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  // Refs for closing dropdown on outside click
  const dietaryRef = useRef<HTMLDivElement>(null);
  const oilRef = useRef<HTMLDivElement>(null);

  // The lists of valid options
  const dietaryOptions = [
    "vegan",
    "dairy-free",
    "nut-free",
    "carnivore",
    "zero histamine",
    "zero vitamin A",
    "zero beta-carotene",
    "ketogenic",
    "gluten-free",
    "grain-free",
    "paleo",
    "autoimmune protocol (AIP)",
  ];
  const cookingOilOptions = [
    "olive oil",
    "avocado oil",
    "sunflower oil",
    "coconut oil",
    "beef tallow",
    "butter",
    "peanut oil",
    "sesame oil",
  ];

  /**
   * Filtered options
   */
  const filteredDietaryOptions = dietaryOptions.filter((opt) =>
    opt.toLowerCase().includes(dietarySearch.toLowerCase())
  );
  const filteredOilOptions = cookingOilOptions.filter((oil) =>
    oil.toLowerCase().includes(oilSearch.toLowerCase())
  );

  // Auto-save function for non-username settings
  const autoSave = async (updates: Partial<{
    dietaryPreferences: string[];
    preferredCookingOil: string;
    preferredImageStyle: ImageStyle;
  }>) => {
    if (!user) return;

    setIsSaving(true);
    setError(null);
    try {
      const userDocRef = doc(db, "users", user.uid);
      await updateDoc(userDocRef, updates).catch(async (err) => {
        if (err.code === "not-found") {
          await setDoc(userDocRef, updates);
        } else {
          throw err;
        }
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error("Error saving settings:", err);
      setError("Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // Debounced auto-save
  const debouncedSave = useCallback((updates: Parameters<typeof autoSave>[0]) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      autoSave(updates);
    }, 500);
  }, [user]);

  // Handle username save separately
  const handleUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSavingUsername(true);
    setError(null);
    try {
      // Validate the username first
      const validation = await validateUsername(username, user.uid);
      if (!validation.isValid) {
        setError(validation.error || "Invalid username");
        return;
      }

      const userDocRef = doc(db, "users", user.uid);
      await setDoc(userDocRef, { username }, { merge: true });

      // Also update the spoonPoints document with the new username
      const spoonRef = doc(db, "spoonPoints", user.uid);
      await setDoc(spoonRef, { username }, { merge: true });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error("Error saving username:", err);
      setError("Failed to save username. Please try again.");
    } finally {
      setSavingUsername(false);
    }
  };

  // Modified handlers to include auto-save
  const handleSelectDietary = (option: string) => {
    if (!dietaryPreferences.includes(option)) {
      const newPreferences = [...dietaryPreferences, option];
      setDietaryPreferences(newPreferences);
      debouncedSave({ dietaryPreferences: newPreferences });
    }
    setDietarySearch("");
    setShowDietaryDropdown(false);
  };

  const handleRemoveDietary = (option: string) => {
    const newPreferences = dietaryPreferences.filter((item) => item !== option);
    setDietaryPreferences(newPreferences);
    debouncedSave({ dietaryPreferences: newPreferences });
  };

  const handleSelectOil = (oil: string) => {
    setPreferredCookingOil(oil);
    setOilSearch(oil);
    setShowOilDropdown(false);
    debouncedSave({ preferredCookingOil: oil });
  };

  const handleRemoveOil = () => {
    setPreferredCookingOil("");
    setOilSearch("");
    debouncedSave({ preferredCookingOil: "" });
  };

  const handleImageStyleChange = (style: ImageStyle) => {
    setPreferredImageStyle(style);
    debouncedSave({ preferredImageStyle: style });
  };

  /**
   * Fetch user's data from database on mount
   */
  useEffect(() => {
    if (!user || loading) return;

    const fetchUserSettings = async () => {
      try {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          setUsername(userData.username || "");
          setDietaryPreferences(userData.dietaryPreferences || []);
          setPreferredCookingOil(userData.preferredCookingOil || "");
          const rawStyle = userData.preferredImageStyle || "photorealistic-recipe";
          const migratedStyle = styleMigration[rawStyle] ?? rawStyle;
          setPreferredImageStyle(
            migratedStyle in imageStyleOptions ? (migratedStyle as ImageStyle) : "photorealistic-recipe"
          );
          setOilSearch(userData.preferredCookingOil || "");
          setPlan(userData.plan || "free");
        }
      } catch (error) {
        console.error("Error fetching user settings:", error);
      }
    };

    fetchUserSettings();
  }, [user, loading]);

  /**
   * Close dropdown if user clicks outside
   */
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dietaryRef.current &&
        !dietaryRef.current.contains(event.target as Node)
      ) {
        setShowDietaryDropdown(false);
      }
      if (oilRef.current && !oilRef.current.contains(event.target as Node)) {
        setShowOilDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // If not logged in (and not loading), show a message
  if (!user && !loading) {
    return (
      <SidebarLayout>
      <div className="max-w-5xl mx-auto px-4 py-10">
        <h2 className="text-3xl font-bold text-center mb-12">Settings</h2>
        <p className="text-center text-amber-800/70">
          You need to be logged in to view settings.
        </p>
      </div>
      </SidebarLayout>
    );
  }

  // Custom loading indicator
  if (loading) {
    return (
      <SidebarLayout>
      <div className="flex flex-col items-center justify-center min-h-screen">
        <img src="/baba-removebg.png" alt="Baba" className="w-32 h-32 mb-6" />
        <div className="typing-indicator flex space-x-2">
          <div className="dot rounded-full w-6 h-6"></div>
          <div className="dot rounded-full w-6 h-6"></div>
          <div className="dot rounded-full w-6 h-6"></div>
        </div>
      </div>
      </SidebarLayout>
    );
  }

  // Render the settings form
  return (
    <SidebarLayout>
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h2 className="text-3xl font-bold text-center mb-12">Settings</h2>

      {/* Save Status Indicator */}
      {(isSaving || saveSuccess) && (
        <div className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg z-50 transition-all duration-300 ${
          isSaving ? "bg-amber-800 text-white" : "bg-amber-600 text-white"
        }`}
        style={{
          opacity: isSaving || saveSuccess ? 1 : 0,
          transform: `translateY(${isSaving || saveSuccess ? '0' : '100%'})`,
          transition: 'opacity 0.3s ease-in-out, transform 0.3s ease-in-out'
        }}>
          {isSaving ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Saving changes...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span>✓</span>
              <span>Changes saved</span>
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="fixed bottom-4 right-4 p-4 bg-red-600 text-white rounded-lg shadow-lg z-50"
          style={{
            opacity: error ? 1 : 0,
            transform: `translateY(${error ? '0' : '100%'})`,
            transition: 'opacity 0.3s ease-in-out, transform 0.3s ease-in-out'
          }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-8">
        {/* Username Section */}
        <div className="p-8 border border-amber-100 rounded-2xl shadow-sm bg-white flex flex-col transition-shadow hover:shadow-md hover:shadow-amber-900/5">
          <form onSubmit={handleUsernameSubmit}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-amber-50 rounded-xl">
                <span className="text-xl">👤</span>
              </div>
              <div className="flex-grow">
                <h3 className="text-2xl font-bold">Username</h3>
                <p className="text-sm text-amber-800/70">
                  Choose how you'll appear on the leaderboard.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="flex-1 p-3 border border-amber-200 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
              />
              <button
                type="submit"
                disabled={savingUsername}
                className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap
                  ${savingUsername
                    ? "bg-amber-200 text-amber-700/60 cursor-not-allowed"
                    : "bg-amber-600 text-white hover:bg-amber-700"
                  }`}
              >
                {savingUsername ? (
                  <>
                    <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  "Save"
                )}
              </button>
            </div>
            {!username && (
              <div className="mt-3 text-amber-600 bg-amber-50 p-3 rounded-lg text-sm flex items-start gap-2">
                <span className="text-lg mt-0.5">⚠️</span>
                <div>
                  <p className="font-medium">Add a username to unlock social features!</p>
                  <p className="text-amber-700 mt-1">
                    Your profile will be available at www.babaselo.com/{"{username}"} where you can share recipes with friends and compete for spoons on the global leaderboard.
                  </p>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Image Style Preferences */}
        <div className="p-8 border border-amber-100 rounded-2xl shadow-sm bg-white flex flex-col transition-shadow hover:shadow-md hover:shadow-amber-900/5">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-amber-50 rounded-xl">
              <span className="text-xl">🎨</span>
            </div>
            <div>
              <h3 className="text-2xl font-bold">Recipe Image Style</h3>
              <p className="text-sm text-amber-800/70">
                Choose how Baba should generate images of your recipes.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(imageStyleOptions).map(([key, style]) => (
              <div
                key={key}
                onClick={() => {
                  setPreferredImageStyle(key as ImageStyle);
                  debouncedSave({ preferredImageStyle: key as ImageStyle });
                }}
                className={`p-4 border rounded-xl cursor-pointer transition-all ${
                  preferredImageStyle === key
                    ? "border-amber-500 bg-amber-50"
                    : "border-amber-100 hover:border-amber-200 hover:bg-amber-50/50"
                }`}
              >
                <div className="aspect-square rounded-lg overflow-hidden bg-amber-50 mb-3 border border-amber-100">
                  <img
                    src={`/style-previews/${key}.png`}
                    alt={`${style.name} style example`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-4 h-4 rounded-full border shrink-0 ${
                    preferredImageStyle === key
                      ? "border-4 border-amber-500"
                      : "border-amber-200"
                  }`} />
                  <h4 className="font-semibold">{style.name}</h4>
                </div>
                <p className="text-sm text-amber-800/70 ml-6">{style.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Dietary Preferences */}
        <div className="p-8 border border-amber-100 rounded-2xl shadow-sm bg-white flex flex-col transition-shadow hover:shadow-md hover:shadow-amber-900/5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-amber-50 rounded-xl">
              <span className="text-xl">🍲</span>
            </div>
            <div>
              <h3 className="text-2xl font-bold">Dietary Preferences</h3>
              <p className="text-sm text-amber-800/70">
                Select multiple dietary restrictions or preferences.
              </p>
            </div>
          </div>

          {/* Input + dropdown for dietary */}
          <div className="relative mb-4" ref={dietaryRef}>
            <input
              type="text"
              value={dietarySearch}
              onChange={(e) => {
                setDietarySearch(e.target.value);
                setShowDietaryDropdown(true);
              }}
              onClick={() => setShowDietaryDropdown(true)}
              placeholder="Type to search..."
              className="w-full p-3 border border-amber-200 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
            />
            {showDietaryDropdown && filteredDietaryOptions.length > 0 && (
              <ul className="absolute z-10 w-full bg-white border border-amber-100 mt-1 rounded-xl shadow-lg max-h-40 overflow-auto">
                {filteredDietaryOptions.map((option) => (
                  <li
                    key={option}
                    onClick={() => handleSelectDietary(option)}
                    className="px-4 py-2.5 hover:bg-amber-50 cursor-pointer transition-colors"
                  >
                    {option}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Selected dietary tags */}
          <div className="flex flex-wrap gap-2">
            {dietaryPreferences.map((pref) => (
              <div
                key={pref}
                className="flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-full text-sm border border-amber-100"
              >
                <span>{pref}</span>
                <button
                  onClick={() => {
                    const newPreferences = dietaryPreferences.filter(item => item !== pref);
                    setDietaryPreferences(newPreferences);
                    debouncedSave({ dietaryPreferences: newPreferences });
                  }}
                  className="text-amber-600/70 hover:text-amber-800 transition-colors"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Preferred Cooking Oil */}
        <div className="p-8 border border-amber-100 rounded-2xl shadow-sm bg-white flex flex-col transition-shadow hover:shadow-md hover:shadow-amber-900/5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-amber-50 rounded-xl">
              <span className="text-xl">🫒</span>
            </div>
            <div>
              <h3 className="text-2xl font-bold">Preferred Cooking Oil</h3>
              <p className="text-sm text-amber-800/70">
                Select a single cooking oil option.
              </p>
            </div>
          </div>

          {/* Input + dropdown for oil */}
          <div className="relative mb-4" ref={oilRef}>
            <input
              type="text"
              value={oilSearch}
              onChange={(e) => {
                setOilSearch(e.target.value);
                setShowOilDropdown(true);
              }}
              onClick={() => setShowOilDropdown(true)}
              placeholder="Type or select a cooking oil..."
              className="w-full p-3 border border-amber-200 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
            />
            {showOilDropdown && filteredOilOptions.length > 0 && (
              <ul className="absolute z-10 w-full bg-white border border-amber-100 mt-1 rounded-xl shadow-lg max-h-40 overflow-auto">
                {filteredOilOptions.map((oil) => (
                  <li
                    key={oil}
                    onClick={() => handleSelectOil(oil)}
                    className="px-4 py-2.5 hover:bg-amber-50 cursor-pointer transition-colors"
                  >
                    {oil}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Selected oil tag */}
          {preferredCookingOil && (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-full text-sm w-fit">
              <span>{preferredCookingOil}</span>
              <button
                onClick={() => {
                  setPreferredCookingOil("");
                  setOilSearch("");
                  debouncedSave({ preferredCookingOil: "" });
                }}
                className="text-amber-600/70 hover:text-amber-800 transition-colors"
              >
                ×
              </button>
            </div>
          )}
        </div>

        {/* Pro: Meal plans config moved to /meal-plans */}
      </div>
    </div>
    </SidebarLayout>
  );
}
