"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "../context/AuthContext";
import { useEffectivePlan } from "../context/PlanDebugContext";
import { auth } from "../lib/backend/client";

const ChatWindow = dynamic(() => import("./ChatWindow").then((m) => m.ChatWindow), { ssr: false });
const ChatSidebar = dynamic(() => import("./ChatSidebar").then((m) => m.ChatSidebar), { ssr: false });

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const user = auth?.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getSessionToken();
  return fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
  });
}

export const HomeClient = () => {
  const chatWindowRef = useRef<any>();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [windowWidth, setWindowWidth] = useState<number | null>(null);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [plan, setPlan] = useState<"free" | "pro">("free");
  const [chatListRefreshKey, setChatListRefreshKey] = useState(0);
  const { user } = useAuth();

  const fetchPlan = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetchWithAuth("/api/me");
      if (res.ok) {
        const data = await res.json();
        setPlan(data.plan || "free");
      }
    } catch {
      setPlan("free");
    }
  }, [user]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const handleChatsChange = useCallback(() => {
    setChatListRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const updateSidebarState = () => {
      const width = window.innerWidth;
      setWindowWidth(width);
      if (width >= 768) {
        setIsSidebarOpen(true);
      } else {
        setIsSidebarOpen(false);
      }
    };

    updateSidebarState();
    window.addEventListener("resize", updateSidebarState);

    return () => {
      window.removeEventListener("resize", updateSidebarState);
    };
  }, []);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const effectivePlan = useEffectivePlan(plan);

  const isMobileOverlay = windowWidth !== null && windowWidth < 768;
  const sidebarClass =
    isSidebarOpen && windowWidth !== null && windowWidth >= 768
      ? "ml-64" // How much should the cental UI slide to the right when the sidebar is opened
      : "ml-0";

  return (
    <div className="flex h-screen relative">
      <ChatSidebar
        focusInput={() => chatWindowRef.current?.focusInput?.()}
        isSidebarOpen={isSidebarOpen}
        toggleSidebar={toggleSidebar}
        chatWindowRef={chatWindowRef}
        currentChatId={effectivePlan === "pro" ? currentChatId : undefined}
        onSelectChat={effectivePlan === "pro" ? setCurrentChatId : undefined}
        onNewChat={effectivePlan === "pro" ? () => setCurrentChatId(null) : undefined}
        plan={effectivePlan}
        onChatsChange={effectivePlan === "pro" ? handleChatsChange : undefined}
        chatListRefreshKey={effectivePlan === "pro" ? chatListRefreshKey : 0}
      />

      {isSidebarOpen && isMobileOverlay && (
        <div
          className="absolute inset-0 bg-black bg-opacity-50 z-10 md:hidden"
          onClick={toggleSidebar}
        ></div>
      )}

      <div className={`transition-all duration-300 flex-grow ${sidebarClass}`}>
        <ChatWindow
          ref={chatWindowRef}
          isSidebarOpen={isSidebarOpen}
          chatId={effectivePlan === "pro" ? currentChatId : undefined}
          plan={effectivePlan}
          onChatIdChange={effectivePlan === "pro" ? setCurrentChatId : undefined}
          onChatsChange={effectivePlan === "pro" ? handleChatsChange : undefined}
        />
      </div>
    </div>
  );
};