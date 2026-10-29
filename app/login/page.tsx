"use client";

import React from "react";
import Image from "next/image";
import { useAuth } from "../context/AuthContext";

const Login = () => {
  const { signIn, authError } = useAuth();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-amber-50/80 to-white">
      {/* Baba logo */}
      <Image
        src="/baba.png"
        alt="Baba Logo"
        width={150}
        height={150}
        className="mb-4"
      />

      {/* Title and Subtitle */}
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Ask me anything, dear</h1>
      <p className="text-gray-600 mb-8 text-center max-w-sm">Your AI Balkan recipe companion—accurate recipes, real grandma vibes, and advice that actually helps. No generic bot nonsense.</p>

      {/* Auth Container */}
      <div className="flex flex-col items-center w-full max-w-[320px] px-6">
        <button
          onClick={signIn}
          className="w-full flex items-center justify-center px-6 py-3 bg-[#4285F4] text-white rounded-lg shadow-sm hover:bg-[#357ABD] transition-colors font-medium"
          aria-label="Continue as local developer"
        >
          Continue as local developer
        </button>
        {authError && (
          <p className="text-red-600 text-sm text-center mt-3" role="alert">
            {authError}
          </p>
        )}
        <p className="text-gray-500 text-xs text-center mt-2">
          A local account with admin access. Data stays on this machine.
        </p>
      </div>

      {/* Terms Text */}
      <p className="text-gray-500 text-xs text-center mt-6 max-w-sm px-6">
        By continuing, you agree to our{' '}
        <a
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-600 hover:text-amber-800 underline"
        >
          Terms of Service
        </a>{' '}
        and{' '}
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-600 hover:text-amber-800 underline"
        >
          Privacy Policy
        </a>
      </p>

      {/* SEO: Discover links for crawlers and users */}
      <nav className="mt-6 flex gap-4 text-sm text-amber-700/80" aria-label="Discover">
        <a href="/blog" className="hover:text-amber-800 underline">
          Blog
        </a>
        <a href="/explore" className="hover:text-amber-800 underline">
          Explore Recipes
        </a>
      </nav>
    </div>
  );
};

export default Login;
