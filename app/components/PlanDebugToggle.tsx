"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { usePlanDebug } from "../context/PlanDebugContext";
import { isAdmin } from "../config/admin";

export function PlanDebugToggle() {
  const { realUser } = useAuth();
  const ctx = usePlanDebug();
  const [isUserAdmin, setIsUserAdmin] = useState(false);

  useEffect(() => {
    if (!realUser) {
      setIsUserAdmin(false);
      return;
    }
    isAdmin(realUser.uid).then(setIsUserAdmin);
  }, [realUser]);

  if (!isUserAdmin || !ctx) return null;

  const { planOverride, setPlanOverride } = ctx;

  return (
    <div
      className="fixed bottom-4 left-4 z-[9999] flex items-center gap-2 bg-gray-900/95 text-white px-3 py-2 rounded-lg shadow-lg border border-gray-700 text-xs font-medium"
      title="Admin: Simulate plan view for debugging"
    >
      <span className="text-gray-400">Simulate:</span>
      <button
        onClick={() => setPlanOverride("actual")}
        className={`px-2 py-1 rounded transition-colors ${planOverride === "actual" ? "bg-amber-600 text-white" : "hover:bg-gray-700"}`}
      >
        Actual
      </button>
      <button
        onClick={() => setPlanOverride("logged_out")}
        className={`px-2 py-1 rounded transition-colors ${
          planOverride === "logged_out" ? "bg-amber-600 text-white" : "hover:bg-gray-700"
        }`}
      >
        Logged out
      </button>
      <button
        onClick={() => setPlanOverride("free")}
        className={`px-2 py-1 rounded transition-colors ${
          planOverride === "free" ? "bg-amber-600 text-white" : "hover:bg-gray-700"
        }`}
      >
        Free
      </button>
      <button
        onClick={() => setPlanOverride("pro")}
        className={`px-2 py-1 rounded transition-colors ${
          planOverride === "pro" ? "bg-amber-600 text-white" : "hover:bg-gray-700"
        }`}
      >
        Pro
      </button>
    </div>
  );
}
