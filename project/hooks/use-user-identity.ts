import { useEffect, useState } from 'react';

// simple memory cache to avoid refetching metadata repeatedly
const metadataCache: Record<string, { full_name?: string; avatar_url?: string }> = {};

/**
 * Determine name/avatar for a user by prioritizing values in this order:
 * 1. `explicitName` / `explicitAvatar` provided by the caller (usually from
 *    `user_profiles`/`user_settings`).
 * 2. Google account metadata fetched from the server via /api/user-metadata.
 *
 * The hook will only fetch metadata when either name or avatar is missing.
 * Results are cached in memory for the lifetime of the page.
 */
export function useUserIdentity(
  userId: string | null | undefined,
  explicitName?: string | null,
  explicitAvatar?: string | null
) {
  const [name, setName] = useState<string | undefined>(explicitName || undefined);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(explicitAvatar || undefined);

  useEffect(() => {
    if (!userId) return;

    // if we already have the values from props, there's nothing to do
    if (explicitName && explicitAvatar) return;

    // if we have cached metadata, use it
    const cached = metadataCache[userId];
    if (cached) {
      if (!name && cached.full_name) setName(cached.full_name);
      if (!avatarUrl && cached.avatar_url) setAvatarUrl(cached.avatar_url);
      return;
    }

    // otherwise fetch metadata
    const load = async () => {
      try {
        const res = await fetch(`/api/user-metadata/${userId}`);
        if (!res.ok) return;
        const data = await res.json();
        metadataCache[userId] = data || {};
        if (!name && data.full_name) setName(data.full_name);
        if (!avatarUrl && data.avatar_url) setAvatarUrl(data.avatar_url);
      } catch (e) {
        console.warn('failed to fetch user metadata for', userId, e);
      }
    };
    void load();
  }, [userId, explicitName, explicitAvatar, name, avatarUrl]);

  return { name, avatarUrl };
}
