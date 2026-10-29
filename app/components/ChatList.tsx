"use client";

import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faThumbtack, faTrashAlt, faEllipsisH, faPlus, faPen } from "@fortawesome/free-solid-svg-icons";
import { MAX_PINNED_CHATS, MAX_VISIBLE_RECENT_CHATS } from "../lib/chatConstants";

export interface ChatSummary {
  id: string;
  title: string;
  pinned: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  messageCount: number;
}

interface ChatListProps {
  currentChatId: string | null;
  onSelectChat: (id: string | null) => void;
  onNewChat: () => void;
  plan: "free" | "pro";
  refreshKey?: number; // Increment to force refresh
}

async function fetchWithAuth(url: string, user: { getSessionToken: () => Promise<string> } | null, options: RequestInit = {}) {
  if (!user) throw new Error("Not authenticated");
  const token = await user.getSessionToken();
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

export const ChatList: React.FC<ChatListProps> = ({
  currentChatId,
  onSelectChat,
  onNewChat,
  plan,
  refreshKey = 0,
}) => {
  const { user } = useAuth();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [loadingPin, setLoadingPin] = useState<string | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [pinWarning, setPinWarning] = useState<string | null>(null);
  const isPro = plan === "pro";

  const loadChats = async () => {
    if (!user) return;
    try {
      const res = await fetchWithAuth("/api/chats", user);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to load chats (${res.status})`);
      }
      const data = await res.json();
      setChats(data.chats || []);
      setPinWarning(null);
    } catch (err) {
      console.error("Error loading chats:", err);
      setChats([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadChats();
    else {
      setChats([]);
      setLoading(false);
    }
  }, [user, refreshKey]);

  const handlePinUnpin = async (id: string, pinned: boolean) => {
    if (!isPro || !user) return;
    if (!pinned && pinnedChats.length >= MAX_PINNED_CHATS) {
      setPinWarning(`You can pin up to ${MAX_PINNED_CHATS} conversations. Unpin one first.`);
      setMenuOpen(null);
      return;
    }

    setPinWarning(null);
    setLoadingPin(id);
    try {
      const res = await fetchWithAuth(`/api/chats/${id}`, user, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !pinned }),
      });
      if (res.ok) {
        await loadChats();
      } else {
        const data = await res.json().catch(() => ({}));
        setPinWarning(
          data.error || `Unable to update pin. Max ${MAX_PINNED_CHATS} pinned conversations.`
        );
      }
    } catch (err) {
      console.error("Error toggling pin:", err);
      setPinWarning("Unable to update pin right now. Please try again.");
    } finally {
      setLoadingPin(null);
      setMenuOpen(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    try {
      const res = await fetchWithAuth(`/api/chats/${id}`, user, { method: "DELETE" });
      if (res.ok) {
        if (currentChatId === id) onSelectChat(null);
        await loadChats();
      }
    } catch (err) {
      console.error("Error deleting chat:", err);
    }
    setMenuOpen(null);
  };

  const handleRename = (id: string, newTitle: string) => {
    if (!user) return;
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setEditingChatId(null);
    setMenuOpen(null);
    setChats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: trimmed } : c))
    );
    fetchWithAuth(`/api/chats/${id}`, user, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed.slice(0, 200) }),
    })
      .then((res) => res.ok && loadChats())
      .catch((err) => {
        console.error("Error renaming chat:", err);
        loadChats();
      });
  };

  const pinnedChats = chats.filter((c) => c.pinned);
  const otherChats = chats.filter((c) => !c.pinned);

  if (!user) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-amber-900/80 text-sm font-semibold">Chats</h2>
        <button
          onClick={onNewChat}
          className="p-1.5 rounded-md hover:bg-amber-100 text-amber-800"
          aria-label="New chat"
        >
          <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
        </button>
      </div>
      {pinWarning && (
        <p className="text-xs text-amber-900 bg-amber-100 border border-amber-200 rounded-md px-2 py-1">
          {pinWarning}
        </p>
      )}

      {loading ? (
        <div className="text-sm text-amber-800/70">Loading chats...</div>
      ) : (
        <>
          {isPro && pinnedChats.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-amber-800/70 uppercase tracking-wide mb-2">
                Pinned
              </h3>
              <ul className="space-y-1">
                {pinnedChats.map((chat) => (
                  <ChatItem
                    key={chat.id}
                    chat={chat}
                    isActive={currentChatId === chat.id}
                    onSelect={() => onSelectChat(chat.id)}
                    onPinUnpin={() => handlePinUnpin(chat.id, chat.pinned)}
                    onRename={(title) => handleRename(chat.id, title)}
                    onDelete={() => handleDelete(chat.id)}
                    menuOpen={menuOpen === chat.id}
                    onMenuToggle={() => setMenuOpen(menuOpen === chat.id ? null : chat.id)}
                    onMenuClose={() => setMenuOpen(null)}
                    editingChatId={editingChatId}
                    onStartEdit={() => { setEditingChatId(chat.id); setMenuOpen(null); }}
                    onCancelEdit={() => setEditingChatId(null)}
                    loadingPin={loadingPin === chat.id}
                    isPro={isPro}
                  />
                ))}
              </ul>
            </div>
          )}

          <div>
            {isPro && pinnedChats.length > 0 && (
              <h3 className="text-xs font-medium text-amber-800/70 uppercase tracking-wide mb-2">
                Recent
              </h3>
            )}
            <div
              className={`${
                otherChats.length > MAX_VISIBLE_RECENT_CHATS
                  ? "max-h-[10.5rem] overflow-y-auto pr-1 chat-list-scrollbar"
                  : ""
              }`}
            >
              <ul className="space-y-1">
                {otherChats.map((chat) => (
                  <ChatItem
                    key={chat.id}
                    chat={chat}
                    isActive={currentChatId === chat.id}
                    onSelect={() => onSelectChat(chat.id)}
                    onPinUnpin={() => handlePinUnpin(chat.id, chat.pinned)}
                    onRename={(title) => handleRename(chat.id, title)}
                    onDelete={() => handleDelete(chat.id)}
                    menuOpen={menuOpen === chat.id}
                    onMenuToggle={() => setMenuOpen(menuOpen === chat.id ? null : chat.id)}
                    onMenuClose={() => setMenuOpen(null)}
                    editingChatId={editingChatId}
                    onStartEdit={() => { setEditingChatId(chat.id); setMenuOpen(null); }}
                    onCancelEdit={() => setEditingChatId(null)}
                    loadingPin={loadingPin === chat.id}
                    isPro={isPro}
                  />
                ))}
              </ul>
            </div>
          </div>

          {chats.length === 0 && (
            <div className="text-center px-4 py-5 bg-amber-50/60 rounded-xl border border-amber-100">
              <div className="text-xl mb-1.5">💬</div>
              <p className="font-medium text-gray-700 text-sm">No chats yet</p>
              <p className="text-gray-500 text-xs mt-0.5">
                {isPro ? "Start a conversation to save it" : "Upgrade so Baba remembers your chats and you can keep multiple conversations"}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

function ChatItem({
  chat,
  isActive,
  onSelect,
  onPinUnpin,
  onRename,
  onDelete,
  menuOpen,
  onMenuToggle,
  onMenuClose,
  editingChatId,
  onStartEdit,
  onCancelEdit,
  loadingPin,
  isPro,
}: {
  chat: ChatSummary;
  isActive: boolean;
  onSelect: () => void;
  onPinUnpin: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onMenuClose: () => void;
  editingChatId: string | null;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  loadingPin: boolean;
  isPro: boolean;
}) {
  const menuRef = useRef<HTMLLIElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuPortalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editValueRef = useRef(chat.title);
  const closedRef = useRef(false);
  const [editValue, setEditValue] = useState(chat.title);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const isEditing = editingChatId === chat.id;

  editValueRef.current = editValue;

  useEffect(() => {
    if (isEditing) {
      closedRef.current = false;
      setEditValue(chat.title);
      editValueRef.current = chat.title;
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing, chat.title]);

  useEffect(() => {
    if (menuOpen && triggerRef.current && typeof document !== "undefined") {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.right - 176, // w-44 = 176px, align right edge with trigger
      });
    }
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        menuPortalRef.current && !menuPortalRef.current.contains(target)
      ) {
        onMenuClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen, onMenuClose]);

  const closeRename = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    const trimmed = editValueRef.current.trim();
    if (trimmed) onRename(trimmed);
    else onCancelEdit();
  };

  const handleRenameSubmit = () => {
    const trimmed = editValue.trim();
    if (trimmed) onRename(trimmed);
    else onCancelEdit();
  };

  return (
    <li ref={menuRef} className="relative group">
      {isEditing && (
        <div
          className="fixed inset-0 z-[100]"
          aria-hidden="true"
          onClick={closeRename}
          onPointerDown={closeRename}
        />
      )}
      {isEditing ? (
        <div className="relative z-[101] px-3 py-2">
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit();
              if (e.key === "Escape") onCancelEdit();
            }}
            onBlur={handleRenameSubmit}
            className="w-full px-2 py-1 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
          />
        </div>
      ) : (
        <button
          ref={triggerRef}
          onClick={onSelect}
          className={`w-full text-left px-3 py-2 pr-8 rounded-lg text-sm flex items-center gap-2 transition-colors relative min-h-[2.25rem] ${
            isActive ? "bg-amber-200/60 font-medium" : "hover:bg-amber-50"
          }`}
        >
          <span className="truncate flex-1">{chat.title}</span>
          <span
            className="absolute top-2 right-2 p-1 rounded hover:bg-amber-100/80 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onMenuToggle();
            }}
          >
            <FontAwesomeIcon
              icon={faEllipsisH}
              className="w-3.5 h-3.5 text-amber-700/70"
            />
          </span>
        </button>
      )}

      {menuOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuPortalRef}
            className="fixed z-[9999] bg-white rounded-xl shadow-lg w-44 border border-amber-100 p-2"
            style={{ top: menuPosition.top, left: menuPosition.left }}
          >
            <button
              className="flex items-center w-full px-3 py-2 rounded-lg hover:bg-amber-50 text-left text-sm"
              onClick={onStartEdit}
            >
              <FontAwesomeIcon icon={faPen} className="w-4 h-4 mr-2 text-amber-700/70" />
              Rename
            </button>
            <button
              className="flex items-center w-full px-3 py-2 rounded-lg hover:bg-amber-50 text-left text-sm disabled:opacity-50"
              onClick={onPinUnpin}
              disabled={!isPro || loadingPin}
            >
              {loadingPin ? (
                <div className="w-4 h-4 mr-2 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <FontAwesomeIcon
                  icon={faThumbtack}
                  className={`w-4 h-4 mr-2 ${chat.pinned ? "text-amber-600" : "text-amber-600/70"}`}
                />
              )}
              {chat.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              className="flex items-center w-full px-3 py-2 rounded-lg hover:bg-amber-50 text-left text-sm text-red-500"
              onClick={onDelete}
            >
              <FontAwesomeIcon icon={faTrashAlt} className="w-4 h-4 mr-2" />
              Delete
            </button>
          </div>,
          document.body
        )}
    </li>
  );
}
