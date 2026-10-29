"use client";

import React, { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { useAuth } from "../context/AuthContext";
import { useEffectivePlan } from "../context/PlanDebugContext";
import { auth, db } from "../lib/backend/client";
import { doc, getDoc, updateDoc, setDoc, collection, getDocs, deleteDoc, Timestamp } from "../lib/backend/database";
import { SidebarLayout } from "../components/SidebarLayout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { FALLBACK_FUN_FACTS } from "../lib/meal-plan/mealPlanFacts";
import { faCheck, faArrowRight, faChevronDown, faCalendarDays, faStop, faTrashCan, faPaperPlane, faStar, faPlay } from "@fortawesome/free-solid-svg-icons";

const EXAMPLE_PROMPTS = [
  "Mediterranean, lots of veggies, olive oil. No red meat.",
  "Quick 30-min weeknight meals. Family-friendly.",
  "Keto, high fat. Avocado oil for cooking.",
  "Vegan, protein-focused. Legumes and tofu.",
  "Low-carb, gluten-free. Comfort food vibes.",
  "Light summer meals. Salads and grilled fish.",
];

const MEAL_PLAN_FAQ = [
  {
    q: "Daily or weekly—which should I choose?",
    a: "Weekly works best if you shop once a week and like to plan ahead. You get a full 7-day plan plus a shopping list. Daily is better if you prefer flexibility—Baba plans one day at a time based on what you might have on hand.",
  },
  {
    q: "When should my weekly plan arrive?",
    a: "Most people choose Saturday morning so they can shop on Sunday and start the week ready. Pick the day that fits your routine—the plan arrives at the time you set (in UTC).",
  },
  {
    q: "What goes in the preferences box?",
    a: "Anything that matters to you: diet (vegan, keto, etc.), cuisines, time limits (30-min meals), allergies, ingredients you love or avoid. The more you add, the more tailored the plans.",
  },
  {
    q: "How are the plans created?",
    a: "Baba creates plans based on what you tell her—diet, cuisines, time limits. Each plan is fresh—daily plans are new each day, weekly plans are new each week. They show up in your inbox when you choose.",
  },
  {
    q: "Do I need a shopping list?",
    a: "For weekly plans, a consolidated list helps you buy everything in one trip. If you prefer to wing it or shop as you go, you can turn it off.",
  },
  {
    q: "Can I tell Baba what ingredients I have?",
    a: "Yes. Use the optional 'Ingredients on hand' field to list what's in your fridge or pantry. Baba will prioritize recipes that use those ingredients and reduce waste.",
  },
];

function MealPlanFaqItem({ question, answer, isOpen, onToggle }: { question: string; answer: string; isOpen: boolean; onToggle: () => void }) {
  return (
    <div
      className={`group border-b border-gray-100 last:border-0 transition-colors ${
        isOpen ? "bg-amber-50/60" : "hover:bg-gray-50/80"
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full px-6 py-5 flex items-center justify-between gap-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:ring-inset rounded-lg mx-2 my-1"
      >
        <span className={`font-semibold text-base pr-4 transition-colors ${isOpen ? "text-amber-900" : "text-gray-900 group-hover:text-amber-800"}`}>
          {question}
        </span>
        <span
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${
            isOpen ? "bg-amber-600 text-white rotate-180" : "bg-amber-100 text-amber-700 group-hover:bg-amber-200"
          }`}
        >
          <FontAwesomeIcon icon={faChevronDown} className="text-sm" />
        </span>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ease-out ${
          isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <p className="px-6 pb-5 pt-0 text-gray-600 text-[15px] leading-relaxed max-w-[90%]">
          {answer}
        </p>
      </div>
    </div>
  );
}

const WEEKDAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

/** Format shoppingList for display - handles string or object (e.g. { produce: "...", dairy: "..." }) */
function formatShoppingListForDisplay(sl: unknown): string {
  if (typeof sl === "string") return sl;
  if (sl && typeof sl === "object" && !Array.isArray(sl)) {
    const lines: string[] = [];
    for (const [cat, val] of Object.entries(sl)) {
      if (val == null) continue;
      const label = cat.charAt(0).toUpperCase() + cat.slice(1);
      if (typeof val === "string") {
        if (val.trim()) lines.push(`${label}:\n${val.trim()}`);
      } else if (Array.isArray(val)) {
        const items = val.filter((v) => v != null && String(v).trim()).map((v) => `- ${String(v).trim()}`);
        if (items.length) lines.push(`${label}:\n${items.join("\n")}`);
      }
    }
    return lines.join("\n\n");
  }
  return "";
}

function formatTimeForDisplay(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const min = String(m || 0).padStart(2, "0");
  if (h === 0) return `12:${min} AM`;
  if (h === 12) return `12:${min} PM`;
  if ((h ?? 0) < 12) return `${h}:${min} AM`;
  return `${(h ?? 12) - 12}:${min} PM`;
}

function getTimezoneLabel(tz: string): string {
  if (tz === "UTC") return "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value || tz;
  } catch {
    return tz;
  }
}

async function fetchPlan(): Promise<"free" | "pro"> {
  const user = auth?.currentUser;
  if (!user) return "free";
  try {
    const token = await user.getSessionToken();
    const res = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      return data.plan || "free";
    }
  } catch {
    // ignore
  }
  return "free";
}

function MealPlansContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const rawPlanId = searchParams.get("plan");
  const planIdFromUrl = rawPlanId && !/^(null|undefined|PLAN_ID)$/i.test(rawPlanId.trim()) ? rawPlanId.trim() : null;
  const [plan, setPlan] = useState<"free" | "pro" | null>(null);
  const effectivePlan = useEffectivePlan(plan ?? "free");

  const [mealPlanPrompt, setMealPlanPrompt] = useState("");
  const [ingredientsOnHand, setIngredientsOnHand] = useState("");
  const mealPlanType = "weekly" as const; // Always weekly
  const [mealPlanEnabled, setMealPlanEnabled] = useState(false);
  const [mealPlanTime, setMealPlanTime] = useState("08:00");
  const [mealPlanDay, setMealPlanDay] = useState(6); // Saturday default for weekly
  const [userTimezone, setUserTimezone] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  });
  const [includeShoppingList, setIncludeShoppingList] = useState(true);
  const [calorieTarget, setCalorieTarget] = useState<number | "">(2000);
  const [mealPlanVariety, setMealPlanVariety] = useState<"varied" | "same_every_day" | "same_every_week" | "leftovers" | "meal_prep_sunday">("varied");
  const [mealPlanSlots, setMealPlanSlots] = useState<("breakfast" | "lunch" | "dinner" | "snack")[]>(["breakfast", "lunch", "dinner"]);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [mealPlanProgress, setMealPlanProgress] = useState<{
    recipeIndex: number;
    totalRecipes: number;
    recipeName: string;
    dayName: string;
    completedDays: number;
    timeSlot: string;
  } | null>(null);
  const [funFacts, setFunFacts] = useState<string[]>([]);
  const [funFactIndex, setFunFactIndex] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showExamplePrompts, setShowExamplePrompts] = useState(false);
  const [activeTab, setActiveTab] = useState<"configure" | "plans">("configure");
  const [planHistory, setPlanHistory] = useState<{
    id: string;
    type: string;
    content: string;
    subject: string;
    babaTip?: string;
    slots?: { timeSlot: string; recipeId: string; recipeName: string; description: string }[];
    days?: { day: number; dayName: string; slots: { timeSlot: string; recipeId: string; recipeName: string; description: string }[] }[];
    shoppingList?: string;
    createdAt: Timestamp;
  }[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [activePlanStartDay, setActivePlanStartDay] = useState<number>(1);
  const [resendingPlanId, setResendingPlanId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setPlan("free");
      return;
    }
    fetchPlan().then(setPlan);
  }, [user]);


  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const d = userDoc.data();
      if (d?.mealPlanPrompt != null) setMealPlanPrompt(d.mealPlanPrompt);
      if (d?.ingredientsOnHand != null) setIngredientsOnHand(d.ingredientsOnHand);
      if (d?.includeShoppingList != null) setIncludeShoppingList(d.includeShoppingList);
      if (d?.mealPlanCalorieTarget != null && typeof d.mealPlanCalorieTarget === "number" && d.mealPlanCalorieTarget > 0) setCalorieTarget(d.mealPlanCalorieTarget);
      else if (d && "mealPlanCalorieTarget" in d && d.mealPlanCalorieTarget == null) setCalorieTarget("");
      const s = d?.mealPlanSchedule;
      if (s) {
        setMealPlanEnabled(!!s.enabled);
        setMealPlanTime(s.time || "08:00");
        if (s.dayOfWeek != null) setMealPlanDay(s.dayOfWeek);
        if (s.timezone) setUserTimezone(s.timezone);
      }
      if (d?.activePlanId != null) setActivePlanId(d.activePlanId);
      if (d?.activePlanStartDay != null) setActivePlanStartDay(d.activePlanStartDay);
      if (d?.mealPlanVariety && ["varied", "same_every_day", "same_every_week", "leftovers", "meal_prep_sunday"].includes(d.mealPlanVariety)) setMealPlanVariety(d.mealPlanVariety);
      if (Array.isArray(d?.mealPlanSlots) && d.mealPlanSlots.length > 0) setMealPlanSlots(d.mealPlanSlots.filter((s: string) => ["breakfast", "lunch", "dinner", "snack"].includes(s)));
    };
    load();
  }, [user]);

  const fetchPlanHistory = useCallback(async (): Promise<typeof planHistory> => {
    if (!user) return [];
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const ref = collection(db, "users", user.uid, "mealPlanHistory");
      const snap = await getDocs(ref);
      const plans = snap.docs.map((d) => {
        const data = d.data();
        const createdAt = data.createdAt;
        return {
          id: d.id,
          type: data.type || "daily",
          content: data.content || "",
          subject: data.subject || "",
          babaTip: data.babaTip,
          slots: data.slots,
          days: data.days,
          shoppingList: data.shoppingList,
          createdAt: createdAt && typeof createdAt.toDate === "function" ? createdAt : undefined,
        };
      });
      // Sort by createdAt desc (no index required)
      plans.sort((a, b) => {
        const aT = a.createdAt?.toDate?.()?.getTime?.() ?? 0;
        const bT = b.createdAt?.toDate?.()?.getTime?.() ?? 0;
        return bT - aT;
      });
      let result = plans.slice(0, 50);
      // If URL has plan=id and it's not in the list (e.g. just created), fetch it directly
      if (planIdFromUrl && !result.some((p) => p.id === planIdFromUrl)) {
        try {
          const planRef = doc(db, "users", user.uid, "mealPlanHistory", planIdFromUrl);
          const planSnap = await getDoc(planRef);
          if (planSnap.exists()) {
            const data = planSnap.data();
            const createdAt = data.createdAt;
            const newPlan = {
              id: planSnap.id,
              type: data.type || "weekly",
              content: data.content || "",
              subject: data.subject || "",
              babaTip: data.babaTip,
              slots: data.slots,
              days: data.days,
              shoppingList: data.shoppingList,
              createdAt: createdAt && typeof createdAt.toDate === "function" ? createdAt : undefined,
            };
            result = [newPlan, ...result];
          }
        } catch {
          // ignore
        }
      }
      setPlanHistory(result);
      return result;
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      const msg = err?.message || String(e);
      setHistoryError(msg);
      if (err?.code === "permission-denied") {
        setHistoryError("Could not read meal plan history. Check that the local backend is running and sign in again.");
      }
      return [];
    } finally {
      setLoadingHistory(false);
    }
  }, [user, planIdFromUrl]);

  useEffect(() => {
    if (user && activeTab === "plans") {
      fetchPlanHistory();
    }
  }, [user, activeTab, fetchPlanHistory]);

  useEffect(() => {
    if (planIdFromUrl && user) {
      setActiveTab("plans");
    }
  }, [planIdFromUrl, user]);

  useEffect(() => {
    if (planIdFromUrl && planHistory.length > 0) {
      const found = planHistory.some((p) => p.id === planIdFromUrl);
      if (found) setExpandedPlanId(planIdFromUrl);
    }
  }, [planIdFromUrl, planHistory]);

  const handleDeletePlan = async (planId: string) => {
    if (!user) return;
    setDeletingPlanId(planId);
    try {
      await deleteDoc(doc(db, "users", user.uid, "mealPlanHistory", planId));
      setPlanHistory((prev) => prev.filter((p) => p.id !== planId));
      if (activePlanId === planId) setActivePlanId(null);
    } catch {
      setHistoryError("Failed to delete plan");
    } finally {
      setDeletingPlanId(null);
    }
  };

  const handleSetActivePlan = async (planId: string, startDay?: number) => {
    if (!user) return;
    setSaving(true);
    setSendError(null);
    try {
      const userDocRef = doc(db, "users", user.uid);
      const day = startDay ?? activePlanStartDay;
      await updateDoc(userDocRef, {
        activePlanId: planId,
        activePlanStartDay: day,
      });
      setActivePlanId(planId);
      setActivePlanStartDay(day);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      setSendError("Failed to set active plan");
    } finally {
      setSaving(false);
    }
  };

  const handleClearActivePlan = async () => {
    if (!user) return;
    setSaving(true);
    setSendError(null);
    try {
      const userDocRef = doc(db, "users", user.uid);
      await updateDoc(userDocRef, { activePlanId: null });
      setActivePlanId(null);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      setSendError("Failed to clear active plan");
    } finally {
      setSaving(false);
    }
  };

  const handleResendIngredients = async (planId: string) => {
    if (!user) return;
    setResendingPlanId(planId);
    setSendError(null);
    try {
      const token = await user.getSessionToken();
      const res = await fetch("/api/meal-plan/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      } else {
        setSendError(data.error || "Failed to resend");
      }
    } catch {
      setSendError("Failed to resend ingredients");
    } finally {
      setResendingPlanId(null);
    }
  };

  const handleQuickEnable = async () => {
    if (!user) return;
    setSaving(true);
    setSendError(null);
    try {
      const userDocRef = doc(db, "users", user.uid);
      await updateDoc(userDocRef, {
        mealPlanSchedule: {
          enabled: true,
          time: mealPlanTime,
          timezone: userTimezone,
          ...(mealPlanType === "weekly" && { dayOfWeek: mealPlanDay }),
        },
      });
      setMealPlanEnabled(true);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      setSendError("Failed to enable");
    } finally {
      setSaving(false);
    }
  };

  const handleStopMealPlan = async () => {
    if (!user) return;
    setSaving(true);
    setSendError(null);
    try {
      const userDocRef = doc(db, "users", user.uid);
      await updateDoc(userDocRef, {
        mealPlanSchedule: {
          enabled: false,
          time: mealPlanTime,
          timezone: userTimezone,
          ...(mealPlanType === "weekly" && { dayOfWeek: mealPlanDay }),
        },
      });
      setMealPlanEnabled(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      setSendError("Failed to stop. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const saveMealPlanConfig = async () => {
    if (!user) return;
    setSaving(true);
    setSendError(null);
    try {
      const userDocRef = doc(db, "users", user.uid);
      const updates = {
        mealPlanPrompt: mealPlanPrompt.trim() || null,
        ingredientsOnHand: ingredientsOnHand.trim() || null,
        mealPlanType,
        includeShoppingList,
        mealPlanCalorieTarget: calorieTarget !== "" && calorieTarget > 0 ? calorieTarget : null,
        mealPlanVariety,
        mealPlanSlots,
        mealPlanSchedule: {
          enabled: mealPlanEnabled,
          time: mealPlanTime,
          timezone: userTimezone,
          ...(mealPlanType === "weekly" && { dayOfWeek: mealPlanDay }),
        },
      };
      await updateDoc(userDocRef, updates).catch(async (err: { code?: string }) => {
        if (err.code === "not-found") {
          await setDoc(userDocRef, updates);
        } else throw err;
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      setSendError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Cycle through fun facts while meal plan is generating
  useEffect(() => {
    if (!sendingNow) return;
    const facts = funFacts.length > 0 ? funFacts : FALLBACK_FUN_FACTS;
    if (facts.length === 0) return;
    const interval = setInterval(() => {
      setFunFactIndex((i) => (i + 1) % facts.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [sendingNow, funFacts.length]);

  const handleSendNow = async () => {
    if (!user) return;
    setSendingNow(true);
    setSendError(null);
    setMealPlanProgress(null);
    setFunFactIndex(0);
    setFunFacts([]);

    // Start both requests in parallel
    const funFactsPromise = fetch("/api/meal-plan/fun-facts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preferences: mealPlanPrompt.trim() || undefined,
        type: mealPlanType,
      }),
    })
      .then((r) => r.json())
      .then((d) => (d.facts?.length ? d.facts : []))
      .catch(() => []);

    const token = await user.getSessionToken();
    const res = await fetch("/api/meal-plan/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        type: mealPlanType,
        includeShoppingList,
        ingredientsOnHand: ingredientsOnHand.trim() || undefined,
        calorieTarget: calorieTarget !== "" && calorieTarget > 0 ? calorieTarget : undefined,
        variety: mealPlanVariety,
        slots: mealPlanSlots,
        reuseLastWeek: mealPlanVariety === "same_every_week",
        stream: true,
      }),
    });

    // Wait for fun facts first (max 4s) so we have them before/during the meal plan wait
    const facts = await Promise.race([
      funFactsPromise,
      new Promise<string[]>((r) => setTimeout(() => r([]), 4000)),
    ]);
    if (facts.length > 0) setFunFacts(facts);

    try {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("ndjson") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let lastData: { planId?: string; emailSent?: boolean; message?: string } | null = null;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const obj = JSON.parse(line) as { type: string; error?: string; planId?: string; emailSent?: boolean; message?: string; recipeIndex?: number; totalRecipes?: number; recipeName?: string; dayName?: string; completedDays?: number; timeSlot?: string };
              if (obj.type === "progress") {
                setMealPlanProgress({
                  recipeIndex: obj.recipeIndex ?? 0,
                  totalRecipes: obj.totalRecipes ?? 0,
                  recipeName: obj.recipeName ?? "",
                  dayName: obj.dayName ?? "",
                  completedDays: obj.completedDays ?? 0,
                  timeSlot: obj.timeSlot ?? "",
                });
              } else if (obj.type === "done") {
                lastData = { planId: obj.planId, emailSent: obj.emailSent, message: obj.message };
              } else if (obj.type === "error") {
                setSendError(obj.error || "Failed to generate meal plan");
              }
            } catch {
              // skip malformed lines
            }
          }
        }
        if (lastData) {
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 2000);
          const plans = await fetchPlanHistory();
          setActiveTab("plans");
          setExpandedPlanId(lastData.planId || plans[0]?.id || null);
          if (lastData.emailSent === false && lastData.message) {
            setSendError(lastData.message);
          }
        }
      } else {
        const data = await res.json();
        if (res.ok) {
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 2000);
          const plans = await fetchPlanHistory();
          setActiveTab("plans");
          setExpandedPlanId(data.planId || plans[0]?.id || null);
          if (!data.emailSent) {
            setSendError(data.message || "Email not configured");
          }
        } else {
          setSendError(data.error || "Failed to send");
        }
      }
    } catch {
      setSendError("Failed to send meal plan");
    } finally {
      setSendingNow(false);
      setMealPlanProgress(null);
    }

    // If fun facts arrived after our 4s wait, use them for next time (or if overlay still showing)
    funFactsPromise.then((f) => f.length > 0 && setFunFacts(f));
  };

  // Not logged in
  if (!user) {
    return (
      <SidebarLayout>
        <div className="min-h-screen bg-gradient-to-b from-amber-50/50 to-white">
          <div className="max-w-4xl mx-auto px-4 py-16">
            {/* Baba image at top */}
            <div className="flex justify-center mb-10">
              <Image src="/baba-removebg.png" alt="Baba Selo" width={160} height={160} className="object-contain" />
            </div>

            <div className="text-center md:text-left max-w-2xl mx-auto">
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                Meal plans that fit your life
              </h1>
              <p className="text-lg text-gray-600 mb-6">
                Weekly plans with variety, shopping lists, and your preferences—delivered to your inbox.
              </p>
              <div className="flex flex-wrap gap-4 justify-center md:justify-start mb-8">
                {["Weekly or daily", "Shopping list included", "Your schedule"].map((item) => (
                  <span key={item} className="flex items-center gap-2 text-gray-700">
                    <span className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <FontAwesomeIcon icon={faCheck} className="text-amber-600 text-xs" />
                    </span>
                    {item}
                  </span>
                ))}
              </div>
              <div className="flex justify-center md:justify-start">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 px-8 py-4 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl"
                >
                  Sign in to get started
                  <FontAwesomeIcon icon={faArrowRight} className="text-sm" />
                </Link>
              </div>

              <div className="mt-16 pt-12 w-full">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-3">How it works</h2>
                <p className="text-gray-500 text-center mb-10 text-sm md:text-base">Everything you need to know about meal plans</p>
                <div className="bg-white rounded-2xl border border-amber-100 shadow-lg shadow-amber-900/5 overflow-hidden">
                  {MEAL_PLAN_FAQ.map((item, i) => (
                    <MealPlanFaqItem
                      key={i}
                      question={item.q}
                      answer={item.a}
                      isOpen={openFaq === i}
                      onToggle={() => setOpenFaq(openFaq === i ? null : i)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </SidebarLayout>
    );
  }

  if (plan === null) {
    return (
      <SidebarLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-pulse text-amber-600">Loading...</div>
        </div>
      </SidebarLayout>
    );
  }

  // Logged-in user (meal plans are free for everyone)
  const displayFacts = funFacts.length > 0 ? funFacts : FALLBACK_FUN_FACTS;
  const currentFact = displayFacts[funFactIndex % displayFacts.length] || displayFacts[0];

  return (
      <SidebarLayout>
        {/* Loading overlay with cycling fun facts */}
        {sendingNow && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-amber-50/95 backdrop-blur-sm">
            <div className="max-w-lg mx-auto px-6 py-12 text-center">
              <Image src="/baba-removebg.png" alt="Baba Selo" width={120} height={120} className="mx-auto mb-6 object-contain" />
              <div className="mb-4">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 rounded-full text-amber-800 font-medium animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Generating your meal plan...
                </div>
              </div>
              {mealPlanProgress && mealPlanProgress.totalRecipes > 0 && (
                <div className="mb-4 p-4 bg-white/80 rounded-xl border border-amber-100 text-left">
                  <p className="text-sm font-medium text-amber-900 mb-1">
                    Recipe {mealPlanProgress.recipeIndex} of {mealPlanProgress.totalRecipes}
                  </p>
                  <p className="text-gray-700 truncate" title={mealPlanProgress.recipeName}>
                    {mealPlanProgress.dayName} · {mealPlanProgress.timeSlot}: {mealPlanProgress.recipeName}
                  </p>
                  {mealPlanProgress.completedDays > 0 && (
                    <p className="text-xs text-amber-700 mt-2">
                      {mealPlanProgress.completedDays} day{mealPlanProgress.completedDays !== 1 ? "s" : ""} complete
                    </p>
                  )}
                  <div className="mt-2 h-1.5 bg-amber-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all duration-300"
                      style={{ width: `${(mealPlanProgress.recipeIndex / mealPlanProgress.totalRecipes) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              <p className="text-gray-600 text-sm mb-6">
                This may take a minute or two. Feel free to leave—your plan will be ready when you come back!
              </p>
              <p key={funFactIndex} className="text-gray-700 text-lg leading-relaxed italic">
                &ldquo;{currentFact}&rdquo;
              </p>
              <p className="mt-4 text-amber-600 text-sm font-medium">— Baba Selo</p>
            </div>
          </div>
        )}

        <div className="min-h-screen bg-gradient-to-b from-amber-50/50 to-white">
          <div className="max-w-5xl mx-auto px-4 py-12">
            {/* Header with Baba */}
            <div className="flex flex-col sm:flex-row items-center gap-6 mb-12">
              <Image src="/baba-removebg.png" alt="Baba Selo" width={80} height={80} className="object-contain flex-shrink-0" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Your Meal Plans</h1>
                <p className="text-gray-600 mt-1">Configure how Baba plans your meals.</p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-8 border-b border-amber-100">
              <button
                onClick={() => setActiveTab("configure")}
                className={`px-4 py-2 font-medium text-sm rounded-t-lg transition-colors ${
                  activeTab === "configure" ? "bg-amber-100 text-amber-900 border-b-2 border-amber-600 -mb-px" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Configure
              </button>
              <button
                onClick={() => setActiveTab("plans")}
                className={`px-4 py-2 font-medium text-sm rounded-t-lg transition-colors ${
                  activeTab === "plans" ? "bg-amber-100 text-amber-900 border-b-2 border-amber-600 -mb-px" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Your Plans
                {planHistory.length > 0 && (
                  <span className="ml-1.5 text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full">
                    {planHistory.length}
                  </span>
                )}
              </button>
            </div>

            {activeTab === "plans" ? (
              /* Your Plans tab */
              <div className="space-y-6">
                {/* Status indicator */}
                <div className="bg-white rounded-2xl border border-amber-100 shadow-lg p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {mealPlanEnabled ? (
                        <>
                          <span className="flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            Active
                          </span>
                          <span className="text-gray-600 text-sm">
                            Next: {WEEKDAYS[mealPlanDay]?.label || "—"} at {formatTimeForDisplay(mealPlanTime)} {userTimezone === "UTC" ? "UTC" : `(${getTimezoneLabel(userTimezone)})`}
                            {" (weekly)"}
                          </span>
                        </>
                      ) : (
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-full text-sm font-medium">
                            <FontAwesomeIcon icon={faStop} className="text-xs" />
                            Paused
                          </span>
                          <span className="text-gray-500 text-sm">No plans will be sent until you enable delivery.</span>
                          <button
                            onClick={handleQuickEnable}
                            disabled={saving}
                            className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors disabled:opacity-50"
                          >
                            Enable delivery
                          </button>
                          <button
                            onClick={() => setActiveTab("configure")}
                            className="text-amber-600 hover:text-amber-700 font-medium text-sm"
                          >
                            or Configure →
                          </button>
                        </div>
                      )}
                    </div>
                    {mealPlanEnabled && (
                      <button
                        onClick={handleStopMealPlan}
                        disabled={saving}
                        className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                      >
                        Stop meal plans
                      </button>
                    )}
                  </div>
                </div>

                {/* History list */}
                <div className="bg-white rounded-2xl border border-amber-100 shadow-lg p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Plans you&apos;ve received</h2>
                  <p className="text-sm text-gray-500 mb-4">Pick one plan as active, resend ingredients, or change when your week starts.</p>
                  {(historyError || sendError) && (
                    <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                      {historyError || sendError}
                    </div>
                  )}
                  {loadingHistory ? (
                    <div className="py-8 text-center text-gray-500">Loading...</div>
                  ) : planHistory.length === 0 && !historyError ? (
                    <div className="py-8 text-center text-gray-500">
                      <FontAwesomeIcon icon={faCalendarDays} className="text-4xl text-amber-200 mb-3" />
                      <p>No meal plans yet.</p>
                      <p className="text-sm mt-1">Click &quot;Send now&quot; in Configure, or enable delivery to get plans automatically.</p>
                      <button
                        onClick={() => setActiveTab("configure")}
                        className="mt-4 text-amber-600 hover:text-amber-700 font-medium text-sm"
                      >
                        Go to Configure →
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {planHistory.map((plan) => {
                        const isActive = activePlanId === plan.id;
                        const hasShoppingList = !!formatShoppingListForDisplay(plan.shoppingList).trim();
                        return (
                        <div
                          key={plan.id}
                          className={`border rounded-xl overflow-hidden ${isActive ? "border-amber-400 bg-amber-50/30 shadow-sm" : "border-amber-100"}`}
                        >
                          <div className="w-full px-4 py-3 flex items-center justify-between gap-4">
                            <button
                              onClick={() => setExpandedPlanId(expandedPlanId === plan.id ? null : plan.id)}
                              className="flex-1 flex items-center justify-between gap-4 text-left hover:bg-amber-50/50 transition-colors -mx-2 px-2 py-1 rounded-lg"
                            >
                              <div className="flex items-center gap-3">
                                {isActive && (
                                  <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-green-100 text-green-800 text-xs font-medium">
                                    <FontAwesomeIcon icon={faStar} className="text-[10px]" />
                                    Active
                                  </span>
                                )}
                                <span className="text-xs font-medium px-2 py-1 rounded bg-amber-100 text-amber-800">
                                  {plan.type === "weekly" ? "Weekly" : "Daily"}
                                </span>
                                <span className="text-sm text-gray-600">
                                  {plan.createdAt?.toDate ? new Date(plan.createdAt.toDate()).toLocaleDateString(undefined, {
                                    weekday: "short",
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }) : "—"}
                                </span>
                              </div>
                              <FontAwesomeIcon
                                icon={faChevronDown}
                                className={`text-amber-600 transition-transform ${expandedPlanId === plan.id ? "rotate-180" : ""}`}
                              />
                            </button>
                            <div className="flex items-center gap-1">
                              {!isActive ? (
                                <button
                                  type="button"
                                  onClick={() => handleSetActivePlan(plan.id)}
                                  disabled={saving}
                                  className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                  title="Use this plan"
                                >
                                  <FontAwesomeIcon icon={faPlay} className="text-[10px]" />
                                  Use this plan
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={handleClearActivePlan}
                                  disabled={saving}
                                  className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                                  title="Stop using this plan"
                                >
                                  Clear active
                                </button>
                              )}
                              {hasShoppingList && (
                                <button
                                  type="button"
                                  onClick={() => handleResendIngredients(plan.id)}
                                  disabled={resendingPlanId === plan.id}
                                  className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50"
                                  title="Resend ingredients to email"
                                >
                                  <FontAwesomeIcon icon={faPaperPlane} className="text-sm" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeletePlan(plan.id)}
                                disabled={deletingPlanId === plan.id}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                title="Delete plan"
                              >
                                <FontAwesomeIcon icon={faTrashCan} className="text-sm" />
                              </button>
                            </div>
                          </div>
                          {expandedPlanId === plan.id && (
                            <div className="px-4 pb-4 pt-0 border-t border-amber-50">
                              <div className="text-sm text-gray-700 font-sans bg-amber-50/50 p-4 rounded-lg max-h-96 overflow-y-auto space-y-4">
                                {plan.slots?.length ? (
                                  <>
                                    {plan.slots.map((slot) => (
                                      <div key={`${slot.timeSlot}-${slot.recipeId}`} className="border-b border-amber-100 pb-3 last:border-0 last:pb-0">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">{slot.timeSlot}</span>
                                        <p className="mt-1">
                                          <Link href={`/recipe/${slot.recipeId}`} className="text-amber-700 hover:text-amber-800 font-medium hover:underline">
                                            {slot.recipeName}
                                          </Link>
                                          <span className="text-gray-600 ml-1">— {slot.description}</span>
                                        </p>
                                      </div>
                                    ))}
                                    {plan.babaTip && (
                                      <p className="pt-2 text-amber-800/90 italic border-t border-amber-200 mt-2">
                                        Baba Tip: {plan.babaTip}
                                      </p>
                                    )}
                                  </>
                                ) : plan.days?.length ? (
                                  <>
                                    {plan.days.map((day) => (
                                      <div key={day.day} className="border-b border-amber-100 pb-4 last:border-0 last:pb-0">
                                        <h4 className="font-semibold text-amber-900 mb-2">{day.dayName}</h4>
                                        <div className="space-y-2 pl-2">
                                          {day.slots.map((slot) => (
                                            <div key={`${day.day}-${slot.timeSlot}-${slot.recipeId}`}>
                                              <span className="text-xs font-medium text-amber-700">{slot.timeSlot}: </span>
                                              <Link href={`/recipe/${slot.recipeId}`} className="text-amber-700 hover:text-amber-800 font-medium hover:underline">
                                                {slot.recipeName}
                                              </Link>
                                              <span className="text-gray-600"> — {slot.description}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                    {(() => {
                                      const slFormatted = formatShoppingListForDisplay(plan.shoppingList);
                                      return slFormatted.trim() ? (
                                        <div className="pt-2 border-t border-amber-200">
                                          <h4 className="font-semibold text-amber-900 mb-1">Shopping list</h4>
                                          <pre className="text-xs text-gray-600 whitespace-pre-wrap">{slFormatted}</pre>
                                        </div>
                                      ) : null;
                                    })()}
                                    {plan.babaTip && (
                                      <p className="pt-2 text-amber-800/90 italic border-t border-amber-200 mt-2">
                                        Baba Tip: {plan.babaTip}
                                      </p>
                                    )}
                                  </>
                                ) : (
                                  <pre className="whitespace-pre-wrap">{plan.content}</pre>
                                )}
                              </div>
                              {/* Start day & actions for active weekly plans */}
                              {expandedPlanId === plan.id && plan.type === "weekly" && (
                                <div className="mt-4 pt-4 border-t border-amber-100 flex flex-wrap items-center gap-4">
                                  {isActive ? (
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-gray-600">Start day:</span>
                                      <select
                                        value={activePlanStartDay}
                                        onChange={(e) => handleSetActivePlan(plan.id, Number(e.target.value))}
                                        disabled={saving}
                                        className="p-2 text-sm border border-amber-200 rounded-lg focus:outline-none focus:border-amber-500"
                                      >
                                        {WEEKDAYS.map((d) => (
                                          <option key={d.value} value={d.value}>
                                            {d.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-gray-600">Start on:</span>
                                      <select
                                        value={activePlanStartDay}
                                        onChange={(e) => setActivePlanStartDay(Number(e.target.value))}
                                        className="p-2 text-sm border border-amber-200 rounded-lg focus:outline-none focus:border-amber-500"
                                      >
                                        {WEEKDAYS.map((d) => (
                                          <option key={d.value} value={d.value}>
                                            {d.label}
                                          </option>
                                        ))}
                                      </select>
                                      <button
                                        type="button"
                                        onClick={() => handleSetActivePlan(plan.id, activePlanStartDay)}
                                        disabled={saving}
                                        className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg"
                                      >
                                        Use this plan
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Left: All preferences in one compact box */}
              <div className="bg-white rounded-2xl border border-amber-100 shadow-lg p-5">
                <h2 className="text-base font-semibold text-gray-900 mb-1">Your preferences</h2>
                <p className="text-xs text-gray-500 mb-3">Diet, cuisines, time limits—in your own words.</p>
                <textarea
                  value={mealPlanPrompt}
                  onChange={(e) => setMealPlanPrompt(e.target.value)}
                  placeholder="e.g. Mediterranean, lots of veggies. No dairy. Quick weeknight meals."
                  className="w-full min-h-[64px] p-3 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-y"
                  rows={2}
                />
                <button
                  type="button"
                  onClick={() => setShowExamplePrompts(!showExamplePrompts)}
                  className="mt-1.5 text-xs text-amber-600 hover:text-amber-700 font-medium"
                >
                  {showExamplePrompts ? "Hide" : "See"} example prompts
                </button>
                {showExamplePrompts && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {EXAMPLE_PROMPTS.map((ex) => (
                      <button
                        key={ex}
                        type="button"
                        onClick={() => setMealPlanPrompt(ex)}
                        className="px-2.5 py-1 text-xs bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-full border border-amber-200 transition-colors"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-amber-100 space-y-4">
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-2">Plan style</label>
                    <select
                      value={mealPlanVariety}
                      onChange={(e) => setMealPlanVariety(e.target.value as typeof mealPlanVariety)}
                      className="w-full p-2.5 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    >
                      <option value="varied">Varied—different meals each day</option>
                      <option value="same_every_day">Same every day—one day repeated</option>
                      <option value="same_every_week">Repeat last week&apos;s plan</option>
                      <option value="leftovers">Leftovers—cook 2–3 dinners, eat same 2–3x</option>
                      <option value="meal_prep_sunday">Meal prep Sunday—same lunch all week</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-2">Meal slots to include</label>
                    <div className="flex flex-wrap gap-3">
                      {(["breakfast", "lunch", "dinner", "snack"] as const).map((slot) => (
                        <label key={slot} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={mealPlanSlots.includes(slot)}
                            onChange={(e) => {
                              if (e.target.checked) setMealPlanSlots((s) => [...s, slot].sort());
                              else setMealPlanSlots((s) => s.filter((x) => x !== slot));
                            }}
                            className="w-4 h-4 rounded"
                          />
                          <span className="text-sm capitalize">{slot}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-amber-100 grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">Ingredients on hand <span className="text-gray-400">(optional)</span></label>
                    <input
                      type="text"
                      value={ingredientsOnHand}
                      onChange={(e) => setIngredientsOnHand(e.target.value)}
                      placeholder="chicken, spinach, lemons..."
                      className="w-full p-2.5 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">Calories/day <span className="text-gray-400">(optional)</span></label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={800}
                        max={4000}
                        step={100}
                        value={calorieTarget === "" ? "" : calorieTarget}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCalorieTarget(v === "" ? "" : (parseInt(v, 10) || 0));
                        }}
                        placeholder="2000"
                        className="w-20 p-2.5 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Schedule + Plan type (above the fold) */}
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-amber-100 shadow-lg p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Delivery schedule</h2>
                  <label className="flex items-center gap-2 cursor-pointer mb-4">
                    <input
                      type="checkbox"
                      checked={mealPlanEnabled}
                      onChange={(e) => setMealPlanEnabled(e.target.checked)}
                      className="w-4 h-4 rounded"
                    />
                    <span>Email me weekly meal plans</span>
                  </label>
                  {mealPlanEnabled && (
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">On</span>
                        <select
                          value={mealPlanDay}
                          onChange={(e) => setMealPlanDay(Number(e.target.value))}
                          className="p-2 border border-amber-200 rounded-lg focus:outline-none focus:border-amber-500"
                        >
                          {WEEKDAYS.map((d) => (
                            <option key={d.value} value={d.value}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                        <span className="text-xs text-gray-500">(shop next day)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">at</span>
                        <input
                          type="time"
                          value={mealPlanTime}
                          onChange={(e) => setMealPlanTime(e.target.value)}
                          className="p-2 border border-amber-200 rounded-lg focus:outline-none focus:border-amber-500"
                        />
                        <span className="text-xs text-gray-500">{userTimezone === "UTC" ? "UTC" : getTimezoneLabel(userTimezone)}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl border border-amber-100 shadow-lg p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">Weekly plan</h2>
                  <p className="text-sm text-gray-500 mb-4">Full 7-day plan with shopping list. Delivered on the day you choose so you can shop the next day.</p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeShoppingList}
                      onChange={(e) => setIncludeShoppingList(e.target.checked)}
                      className="w-4 h-4 rounded"
                    />
                    <span>Include shopping list</span>
                  </label>
                </div>

                {sendError && <p className="text-red-600 text-sm">{sendError}</p>}
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={saveMealPlanConfig}
                    disabled={saving}
                    className="px-6 py-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-all"
                  >
                    {saving ? "Saving..." : saveSuccess ? "Saved!" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSendNow}
                    disabled={sendingNow}
                    className="px-6 py-3 bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold rounded-xl transition-all disabled:opacity-50"
                  >
                    {sendingNow ? "Generating..." : "Send now"}
                  </button>
                </div>
              </div>
            </div>
            )}

            {/* FAQ */}
            <div className="mt-16 pt-12">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-3">Common questions</h2>
              <p className="text-gray-500 text-center mb-10 text-sm md:text-base">Everything you need to know about meal plans</p>
              <div className="bg-white rounded-2xl border border-amber-100 shadow-lg shadow-amber-900/5 overflow-hidden">
                {MEAL_PLAN_FAQ.map((item, i) => (
                  <MealPlanFaqItem
                    key={i}
                    question={item.q}
                    answer={item.a}
                    isOpen={openFaq === i}
                    onToggle={() => setOpenFaq(openFaq === i ? null : i)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </SidebarLayout>
  );
}

export default function MealPlansPage() {
  return (
    <Suspense
      fallback={
        <SidebarLayout>
          <div className="min-h-screen flex items-center justify-center">
            <div className="animate-pulse text-amber-600">Loading...</div>
          </div>
        </SidebarLayout>
      }
    >
      <MealPlansContent />
    </Suspense>
  );
}
