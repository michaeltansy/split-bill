'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { AuthUser } from '@/types';

export function AccountMenu() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const u = data.user;
      if (!u) {
        setUser(null);
        return;
      }
      setUser({
        id: u.id,
        email: u.email ?? null,
        name: (u.user_metadata?.full_name as string | undefined) ?? u.email ?? null,
        avatar_url: (u.user_metadata?.avatar_url as string | undefined) ?? null,
      });
    });
    return () => {
      active = false;
    };
  }, []);

  if (!user) return null;

  return (
    <div className="w-full flex items-center justify-between gap-3">
      {/* Nav on the upper left */}
      <Link
        href="/sessions"
        className="text-sm font-medium text-text-secondary hover:text-brand-primary"
      >
        My Sessions
      </Link>

      {/* Account cluster on the upper right */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {user.avatar_url ? (
            <Image
              src={user.avatar_url}
              alt={user.name ?? 'Account'}
              width={32}
              height={32}
              className="rounded-full shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-brand-primary-soft text-brand-primary flex items-center justify-center font-semibold shrink-0">
              {(user.name ?? '?').charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-sm font-medium text-text-primary truncate max-w-[8rem] hidden sm:block">
            {user.name}
          </span>
        </div>
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="text-sm font-medium text-text-secondary hover:text-status-danger"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
