// app/components/ProfileMenu.tsx
import React, { useRef, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookOpenReader, faGear, faHome, faSignOut, faStarOfLife, faSpoon, faCompass, faStore, faShieldHalved, faNewspaper, faCalendarDays } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../config/admin';
import { doc, getDoc, onSnapshot } from '../lib/backend/database';
import { db } from "../lib/backend/client";

interface ProfileMenuProps {
    isOpen: boolean;
    onClose: () => void;
    onLogout: () => void;
}

export const ProfileMenu: React.FC<ProfileMenuProps> = ({ isOpen, onClose, onLogout }) => {
    const menuRef = useRef<HTMLDivElement | null>(null);
    const { user, signIn } = useAuth();
    const router = useRouter();
    const [isUserAdmin, setIsUserAdmin] = useState(false);
    const [username, setUsername] = useState<string>("");

    const handleLogout = async () => {
        await onLogout();
        router.push('/login');
    };

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

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener("click", handleClickOutside);
        }
        return () => {
            document.removeEventListener("click", handleClickOutside);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    // Non-authenticated menu version
    if (!user) {
        return (
            <div
                ref={menuRef}
                className="absolute top-full right-0 mt-1 z-40 bg-white rounded-3xl shadow-lg w-60 border border-amber-100 p-3"
            >
                <ul className="space-y-1">
                    <li className="px-4 py-2">
                        <div className="text-sm text-gray-500">Welcome to</div>
                        <div className="font-medium">Baba Selo</div>
                        <div className="text-xs text-amber-700/80 mt-0.5">Your AI Balkan recipe companion</div>
                    </li>
                    <hr />
                    <li className="flex items-center px-4 py-2 rounded-md hover:bg-amber-50 cursor-pointer">
                        <Link href="/" className="flex items-center w-full">
                            <FontAwesomeIcon icon={faHome} className="text-amber-700 mr-3" />
                            <span>Home</span>
                        </Link>
                    </li>
                    <li className="flex items-center px-4 py-2 rounded-md hover:bg-amber-50 cursor-pointer">
                        <Link href="/explore" className="flex items-center w-full">
                            <FontAwesomeIcon icon={faCompass} className="text-amber-700 mr-3" />
                            <span>Explore Recipes</span>
                        </Link>
                    </li>
                    <li className="flex items-center px-4 py-2 rounded-md hover:bg-amber-50 cursor-pointer">
                        <Link href="/blog" className="flex items-center w-full">
                            <FontAwesomeIcon icon={faNewspaper} className="text-amber-700 mr-3" />
                            <span>Blog</span>
                        </Link>
                    </li>
                    <hr />
                    <li className="flex items-center px-4 py-2 rounded-md hover:bg-amber-50 cursor-pointer">
                        <Link href="/meal-plans" className="flex items-center w-full">
                            <FontAwesomeIcon icon={faCalendarDays} className="text-amber-700 mr-3" />
                            <span>Meal Plans</span>
                        </Link>
                    </li>
                    <hr />
                    <li
                        className="flex items-center px-4 py-2 rounded-md hover:bg-amber-50 cursor-pointer"
                        onClick={() => { signIn(); onClose(); }}
                    >
                        <FontAwesomeIcon icon={faShieldHalved} className="text-amber-700 mr-3" />
                        <span className="font-medium">Continue as local developer</span>
                    </li>
                    <li className="px-4 py-1">
                        <p className="text-xs text-gray-500">New here? One click and you&apos;re in.</p>
                    </li>
                </ul>
            </div>
        );
    }

    // Authenticated menu version
    return (
        <div
            ref={menuRef}
            className="absolute top-full right-0 mt-1 z-40 bg-white rounded-3xl shadow-lg w-60 border border-amber-100 p-3"
            style={{ maxHeight: 'calc(100vh - 5rem)', overflowY: 'auto' }}
        >
            <ul className="space-y-1">
                <li className="px-4 py-2">
                    <div className="text-sm text-gray-500">Welcome,</div>
                    <div className="flex items-center justify-between">
                        <Link
                            href={username ? `/${username}` : "/settings"}
                            className="font-medium hover:text-amber-600 transition-colors"
                        >
                            {"Chef " + username || "Anonymous Chef"}
                        </Link>
                        {!username && (
                            <Link
                                href="/settings"
                                className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full hover:bg-amber-200 transition-colors"
                            >
                                Set Username! 👤
                            </Link>
                        )}
                    </div>
                </li>
                <hr />
                {/* Primary: core navigation */}
                <li className="flex items-center px-4 py-2 rounded-md hover:bg-amber-50 cursor-pointer">
                    <Link href="/" className="flex items-center w-full">
                        <FontAwesomeIcon icon={faHome} className="text-amber-700 mr-3" />
                        <span>Home</span>
                    </Link>
                </li>
                <li className="flex items-center px-4 py-2 rounded-md hover:bg-amber-50 cursor-pointer">
                    <Link href={username ? `/${username}` : "/recipes"} className="flex items-center w-full">
                        <FontAwesomeIcon icon={faBookOpenReader} className="text-amber-700 mr-3" />
                        <span>My Recipes</span>
                    </Link>
                </li>
                <li className="flex items-center px-4 py-2 rounded-md hover:bg-amber-50 cursor-pointer">
                    <Link href="/explore" className="flex items-center w-full">
                        <FontAwesomeIcon icon={faCompass} className="text-amber-700 mr-3" />
                        <span>Explore Recipes</span>
                    </Link>
                </li>
                <li className="flex items-center px-4 py-2 rounded-md hover:bg-amber-50 cursor-pointer">
                    <Link href="/blog" className="flex items-center w-full">
                        <FontAwesomeIcon icon={faNewspaper} className="text-amber-700 mr-3" />
                        <span>Blog</span>
                    </Link>
                </li>
                <hr />
                {/* Engagement: plan → earn → redeem */}
                <li className="flex items-center px-4 py-2 rounded-md hover:bg-amber-50 cursor-pointer">
                    <Link href="/meal-plans" className="flex items-center w-full">
                        <FontAwesomeIcon icon={faCalendarDays} className="text-amber-700 mr-3" />
                        <span>Meal Plans</span>
                    </Link>
                </li>
                <li className="flex items-center px-4 py-2 rounded-md hover:bg-amber-50 cursor-pointer">
                    <Link href="/spoons" className="flex items-center w-full justify-between">
                        <div className="flex items-center">
                            <FontAwesomeIcon icon={faSpoon} className="text-amber-700 mr-3" />
                            <span>Spoons</span>
                        </div>
                        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full font-medium">
                            Earn 🥄
                        </span>
                    </Link>
                </li>
                <li className="flex items-center px-4 py-2 rounded-md hover:bg-amber-50 cursor-pointer">
                    <Link href="/marketplace" className="flex items-center w-full justify-between">
                        <div className="flex items-center">
                            <FontAwesomeIcon icon={faStore} className="text-amber-700 mr-3" />
                            <span>Market</span>
                        </div>
                        <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full font-medium">
                            Redeem 🎁
                        </span>
                    </Link>
                </li>
                <hr />
                {/* Config */}
                <li className="flex items-center px-4 py-2 rounded-md hover:bg-amber-50 cursor-pointer">
                    <Link href="/settings" className="flex items-center w-full">
                        <FontAwesomeIcon icon={faGear} className="text-amber-700 mr-3" />
                        <span>Settings</span>
                    </Link>
                </li>
                {isUserAdmin && (
                    <li className="flex items-center px-4 py-2 rounded-md hover:bg-amber-50 cursor-pointer">
                        <Link href="/admin" className="flex items-center w-full">
                            <FontAwesomeIcon icon={faShieldHalved} className="text-amber-700 mr-3" />
                            <span>Admin</span>
                        </Link>
                    </li>
                )}
                <hr />
                <li className="flex items-center px-4 py-2 rounded-md hover:bg-amber-50 cursor-pointer">
                    <Link href="/upgrade" className="flex items-center w-full">
                        <FontAwesomeIcon icon={faStarOfLife} className="text-amber-600 mr-3" />
                        <span>Upgrade Plan</span>
                    </Link>
                </li>
                <hr />
                <li
                    className="flex items-center px-4 py-2 rounded-md hover:bg-amber-50 cursor-pointer"
                    onClick={handleLogout}
                >
                    <FontAwesomeIcon icon={faSignOut} className="text-amber-700 mr-3" />
                    <span>Log Out</span>
                </li>
            </ul>
        </div>
    );
};
