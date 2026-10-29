"use client";

import React, { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter, usePathname } from "next/navigation";

// Add paths that require authentication
const protectedPaths = [
  '/marketplace',
  '/settings',
  '/admin',
  '/upgrade',
  '/spoons',
  '/recipes'
];

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Check if current path is protected
    const isProtectedPath = protectedPaths.some(path => pathname === path || pathname.startsWith(path + '/'));

    // If it's a protected path and user is not authenticated (and we're done loading)
    if (isProtectedPath && !loading && !user) {
      // Immediate redirect
      router.replace('/login');
      return;
    }
  }, [user, loading, router, pathname]);

  // While loading, show spinner
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-amber-50/30 to-transparent">
        <img src="/baba-removebg.png" alt="Baba" className="w-32 h-32 mb-6" />
        <div className="typing-indicator flex space-x-2">
          <div className="dot rounded-full w-6 h-6"></div>
          <div className="dot rounded-full w-6 h-6"></div>
          <div className="dot rounded-full w-6 h-6"></div>
        </div>
      </div>
    );
  }

  // If it's a protected path and user is not authenticated, don't render anything
  // This prevents any flash of content before the redirect
  const isProtectedPath = protectedPaths.some(path => pathname === path || pathname.startsWith(path + '/'));
  if (isProtectedPath && !user) {
    return null;
  }

  // If we get here, either:
  // 1. The path is not protected, or
  // 2. The user is authenticated
  return <>{children}</>;
};
