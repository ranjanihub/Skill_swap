import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// simple memory cache to avoid refetching metadata repeatedly
const metadataCache: Record<string, { full_name?: string; avatar_url?: string }> = {};

/**
 * Determine name/avatar for a user with a 3-tier priority:
 *   1. `explicitName` / `explicitAvatar` provided by the caller (user-uploaded
 *       values from `user_settings` / `user_profiles`).
 *   2. Google / OAuth metadata fetched from `/api/user-metadata` (which itself
 *      checks DB → provider metadata).
 *   3. Placeholder defaults: "User" for name, undefined for avatar.
 *
 * Results are cached in memory for the lifetime of the page.
 */
export function useUserIdentity(
  userId: string | null | undefined,
  explicitName?: string | null,
  explicitAvatar?: string | null
) {
  const [name, setName] = useState<string>(explicitName || 'User');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(explicitAvatar || undefined);

  useEffect(() => {
    // keep in sync when explicit props change
    if (explicitName) setName(explicitName);
    if (explicitAvatar) setAvatarUrl(explicitAvatar);
  }, [explicitName, explicitAvatar]);

  useEffect(() => {
    if (!userId) return;

    // if we already have both values from props, nothing to fetch
    if (explicitName && explicitAvatar) return;

    // if we have cached metadata, fill in the gaps
    const cached = metadataCache[userId];
    if (cached) {
      if (!explicitName && cached.full_name) setName(cached.full_name);
      if (!explicitAvatar && cached.avatar_url) setAvatarUrl(cached.avatar_url);
      return;
    }

    // otherwise fetch metadata from the API (which implements full 3-tier fallback)
    let cancelled = false;
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;

        const res = await fetch(`/api/user-metadata/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        metadataCache[userId] = data || {};
        if (cancelled) return;
        if (!explicitName && data.full_name) setName(data.full_name);
        if (!explicitAvatar && data.avatar_url) setAvatarUrl(data.avatar_url);
      } catch (e) {
        console.warn('failed to fetch user metadata for', userId, e);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [userId, explicitName, explicitAvatar]);

  return { name, avatarUrl };
}
