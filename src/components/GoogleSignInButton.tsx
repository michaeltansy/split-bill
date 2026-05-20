'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { safeRedirect } from '@/lib/safeRedirect';

interface GoogleSignInButtonProps {
  redirect?: string | null;
}

export function GoogleSignInButton({ redirect }: GoogleSignInButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    setIsLoading(true);
    const dest = safeRedirect(redirect);
    const callbackUrl = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(dest)}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl },
    });

    // On success the browser navigates to Google, so we only reach here on error.
    if (error) {
      console.error('Google sign-in failed:', error);
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleSignIn}
      disabled={isLoading}
      className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-brand-primary text-white font-semibold rounded-xl hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#FFFFFF"
          d="M21.35 11.1H12v2.92h5.35c-.23 1.48-1.62 4.34-5.35 4.34-3.22 0-5.85-2.66-5.85-5.94S8.78 6.48 12 6.48c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.71 3.86 14.6 3 12 3 6.98 3 2.9 7.03 2.9 12s4.08 9 9.1 9c5.26 0 8.74-3.7 8.74-8.9 0-.6-.06-1.06-.14-1.5z"
        />
      </svg>
      {isLoading ? 'Redirecting…' : 'Continue with Google'}
    </button>
  );
}
