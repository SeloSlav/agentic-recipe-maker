// app/components/ChatSidebar.tsx
import React, { useState, useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHamburger, faPersonRifle, faPencilRuler, faClose, faThumbtack, faTrashAlt, faStarOfLife, faNewspaper, faCalendarDays } from "@fortawesome/free-solid-svg-icons";
import { useAuth } from "../context/AuthContext";
import { RecipeList } from "./RecipeList";
import { ChatList } from "./ChatList";
import { SeloOilPromo } from "./SeloOilPromo";
import Link from "next/link";
import Image from "next/image";
import { doc, onSnapshot } from '../lib/backend/database';
import { db } from "../lib/backend/client";

// Add shimmer effect for loading state
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

export const ChatSidebar = ({
    focusInput = () => {},
    isSidebarOpen,
    toggleSidebar,
    chatWindowRef,
    recipe,
    loadingPinAction,
    handlePinUnpin,
    handleDelete,
    currentChatId,
    onSelectChat,
    onNewChat,
    plan,
    onChatsChange,
    chatListRefreshKey = 0
}: {
    focusInput?: () => void;
    isSidebarOpen: boolean;
    toggleSidebar: () => void;
    chatWindowRef?: React.RefObject<any>;
    recipe?: any;
    loadingPinAction?: boolean;
    handlePinUnpin?: (isPinned: boolean) => void;
    handleDelete?: (id: string, title: string) => void;
    currentChatId?: string | null;
    onSelectChat?: (id: string | null) => void;
    onNewChat?: () => void;
    plan?: "free" | "pro";
    onChatsChange?: () => void;
    chatListRefreshKey?: number;
}) => {
    const [isHydrated, setIsHydrated] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [isImageLoading, setIsImageLoading] = useState(true);
    const [username, setUsername] = useState<string>("");
    const { user } = useAuth();

    useEffect(() => {
        setIsHydrated(true);
    }, []);

    useEffect(() => {
        if (!user) {
            setUsername("");
            return;
        }

        // Set up real-time listener for username changes
        const unsubscribe = onSnapshot(doc(db, "users", user.uid), (doc) => {
            if (doc.exists()) {
                setUsername(doc.data().username || "");
            } else {
                setUsername("");
            }
        });

        // Cleanup subscription on unmount
        return () => unsubscribe();
    }, [user]);

    const renderMenu = () => {
        return (
                        <div className="absolute right-0 z-40 bg-white rounded-xl shadow-lg w-48 border border-amber-100 p-2">
                <ul className="space-y-1">
                        <li
                        className="flex items-center px-3 py-2 rounded-md hover:bg-amber-50 cursor-pointer disabled:opacity-50"
                        onClick={() => !loadingPinAction && handlePinUnpin(!!recipe.pinned)}
                    >
                        {loadingPinAction ? (
                            <>
                                <div className="w-4 h-4 mr-3">
                                    <div className="w-full h-full border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
                                </div>
                                <span>{recipe.pinned ? 'Unpinning...' : 'Pinning...'}</span>
                            </>
                        ) : (
                            <>
                                <FontAwesomeIcon
                                    icon={faThumbtack}
                                    className={`w-4 h-4 mr-3 transform transition-all duration-300 ${
                                        recipe.pinned ? 'rotate-[45deg] scale-110 text-amber-600' : 'hover:scale-110 text-amber-600/70'
                                    }`}
                                />
                                <span>{recipe.pinned ? "Unpin Recipe" : "Pin Recipe"}</span>
                            </>
                        )}
                    </li>
                    <li
                        className="flex items-center px-3 py-2 rounded-md hover:bg-gray-100 cursor-pointer text-red-500"
                        onClick={() => handleDelete(recipe.id, recipe.recipeTitle)}
                    >
                        <FontAwesomeIcon icon={faTrashAlt} className="w-4 h-4 mr-3" />
                        <span>Delete recipe</span>
                    </li>
                </ul>
            </div>
        );
    };

    return (
        <div>
            {/* Hamburger Menu Icon */}
            <button
                onClick={toggleSidebar}
                className="fixed top-4 left-4 z-30 p-2 rounded-md hover:bg-amber-100 bg-white border border-amber-100 shadow-sm"
            >
                <FontAwesomeIcon icon={faHamburger} className="text-amber-800" />
            </button>

            {/* Sidebar */}
            <aside
                className={`fixed inset-y-0 left-0 transform z-20 bg-amber-50/80 w-64 h-full shadow-inner border-r border-amber-100 transition-transform duration-300 ease-in-out ${
                    isSidebarOpen ? "translate-x-0" : "-translate-x-full"
                }`}
            >
                <div className="flex flex-col h-full">
                    {/* Sidebar Header with optimized image */}
                    <div className="flex items-center justify-between p-4 border-b border-amber-100">
                        <div className="relative w-8 h-8">
                            {!imageError ? (
                                <Image
                                    src="/baba-removebg.png"
                                    alt="Baba Logo"
                                    fill
                                    className={`object-contain transition-opacity duration-300 ${
                                        isImageLoading ? 'opacity-0' : 'opacity-100'
                                    }`}
                                    onLoad={() => setIsImageLoading(false)}
                                    onError={() => setImageError(true)}
                                    placeholder="blur"
                                    blurDataURL={`data:image/svg+xml;base64,${toBase64(shimmer(32, 32))}`}
                                    sizes="32px"
                                    priority
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-amber-100 rounded-full">
                                    <span className="text-lg">👨‍🍳</span>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={toggleSidebar}
                            className="p-2 rounded-md hover:bg-amber-100"
                        >
                            <FontAwesomeIcon icon={faClose} className="text-amber-800" />
                        </button>
                    </div>

                    {/* Recipe List Component */}
                    <div className="flex-grow overflow-y-auto p-4 space-y-6">
                        {/* Selo Oil Promo */}
                        <SeloOilPromo />

                        {/* Chat List - Pro only: free users get one ephemeral chat, nothing saved */}
                        {plan === "pro" && currentChatId !== undefined && onSelectChat && onNewChat && (
                            <ChatList
                                currentChatId={currentChatId ?? null}
                                onSelectChat={onSelectChat}
                                onNewChat={onNewChat}
                                plan={plan}
                                refreshKey={chatListRefreshKey}
                            />
                        )}

                        <RecipeList />

                        {/* View All Recipes Link */}
                        <div className="pt-4 border-t border-amber-100 space-y-2">
                            <Link
                                href="/blog"
                                className="flex items-center justify-center gap-2 text-sm text-amber-900/80 hover:text-amber-900 transition-colors p-2 rounded-lg hover:bg-amber-50"
                            >
                                <FontAwesomeIcon icon={faNewspaper} className="text-amber-600" />
                                <span>Blog</span>
                            </Link>
                            <Link
                                href="/meal-plans"
                                className="flex items-center justify-center gap-2 text-sm text-amber-900/80 hover:text-amber-900 transition-colors p-2 rounded-lg hover:bg-amber-50"
                            >
                                <FontAwesomeIcon icon={faCalendarDays} className="text-amber-600" />
                                <span>Meal Plans</span>
                                <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                                    Pro ⭐
                                </span>
                            </Link>
                            <Link
                                href={user ? (username ? `/${username}` : "/recipes") : "/explore"}
                                className="flex items-center justify-center gap-2 text-sm text-amber-900/80 hover:text-amber-900 transition-colors p-2 rounded-lg hover:bg-amber-50"
                            >
                                <span>{user ? "View All Recipes" : "Explore All Recipes"}</span>
                                <span className="text-amber-600/70">→</span>
                            </Link>

                            <Link
                                href="/upgrade"
                                className="flex items-center justify-center gap-2 text-sm text-amber-900/80 hover:text-amber-900 transition-colors p-2 rounded-lg hover:bg-amber-50"
                            >
                                <FontAwesomeIcon icon={faStarOfLife} className="text-amber-600" />
                                <span>Upgrade Plan</span>
                            </Link>
                        </div>
                    </div>
                </div>
            </aside>
        </div>
    );
};
