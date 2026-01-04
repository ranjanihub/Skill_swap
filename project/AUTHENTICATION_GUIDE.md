# SkillSwap Authentication & Dashboard Guide

## Overview

This document outlines the complete authentication system and dashboard implementation for the SkillSwap platform built with Next.js 14, Supabase, and Tailwind CSS.

## Architecture

### Directory Structure

```
app/
├── layout.tsx                 # Root layout with AuthProvider
├── page.tsx                   # Home page with hero and how-it-works
├── login/page.tsx             # Login page
├── signup/page.tsx            # Sign up page
├── forgot-password/page.tsx   # Password reset request
└── dashboard/
    └── page.tsx               # Dashboard home page

context/
└── auth-context.tsx           # Authentication context provider

lib/
└── supabase.ts                # Supabase client and types

components/
├── protected-route.tsx        # Protected route wrapper
├── hero-section.tsx           # Hero section
├── how-it-works.tsx           # How it works section
└── ui/                        # shadcn/ui components
```

## Database Schema

### Tables

1. **user_profiles**
   - `id` (uuid): Links to Supabase auth.users
   - `full_name` (text): User's display name
   - `bio` (text): User biography
   - `swap_points` (integer): Skill exchange currency
   - `skills_count` (integer): Total skills added
   - `created_at` / `updated_at` (timestamptz): Timestamps

2. **skills**
   - `id` (uuid): Unique skill identifier
   - `user_id` (uuid): Foreign key to user_profiles
   - `name` (text): Skill name
   - `description` (text): Skill description
   - `category` (text): Skill category
   - `skill_type` (text): 'teach' or 'learn'
   - `proficiency_level` (text): 'beginner', 'intermediate', or 'advanced'
   - `created_at` / `updated_at` (timestamptz): Timestamps

3. **skill_swap_sessions**
   - `id` (uuid): Session identifier
   - `user_a_id` / `user_b_id` (uuid): Participating users
   - `skill_a_id` / `skill_b_id` (uuid): Skills being exchanged
   - `status` (text): 'scheduled', 'ongoing', 'completed', or 'cancelled'
   - `scheduled_at` (timestamptz): Session start time
   - `duration_minutes` (integer): Session duration
   - `notes` (text): Session notes
   - `created_at` (timestamptz): Creation timestamp

### Row Level Security (RLS)

All tables have RLS enabled with the following policies:

- **user_profiles**: Users can view all profiles but only update their own
- **skills**: Users can view all skills but only manage their own
- **skill_swap_sessions**: Users can only view and manage sessions they participate in

## Authentication Flow

### Sign Up Flow

1. User navigates to `/signup`
2. Enters full name, email, and password with validation
3. `signUp()` creates account in Supabase Auth
4. User profile automatically created on first dashboard access
5. Redirects to `/dashboard`

### Login Flow

1. User navigates to `/login`
2. Enters email and password
3. `signIn()` authenticates with Supabase
4. On success, redirects to `/dashboard`
5. On failure, displays error message

### OAuth (Google) Flow

1. User clicks "Continue with Google"
2. `signInWithGoogle()` redirects to Google consent screen
3. After consent, redirects back to `/dashboard`
4. User profile created if first time login

### Password Reset Flow

1. User clicks "Forgot password?" on login page
2. Enters email on `/forgot-password`
3. Email sent with reset link
4. User follows link to reset password
5. Returns to login page

## Pages

### Public Pages

- `/` - Home page with hero and how-it-works sections
- `/login` - User login with email/password and Google OAuth
- `/signup` - New user registration
- `/forgot-password` - Password reset request

### Protected Pages

- `/dashboard` - User dashboard with personalized content

Protected pages redirect unauthenticated users to `/login`.

## Components

### AuthProvider

Located in `context/auth-context.tsx`, manages:
- Session state
- User authentication state
- Sign up, login, logout, and Google OAuth functions
- Loading states

### useAuth Hook

Access authentication anywhere with:

```typescript
import { useAuth } from '@/context/auth-context';

export function MyComponent() {
  const { user, session, loading, signIn, signOut, signInWithGoogle } = useAuth();
  // ...
}
```

### ProtectedRoute

Wrap components to restrict access to authenticated users:

```typescript
import { ProtectedRoute } from '@/components/protected-route';

export default function Page() {
  return (
    <ProtectedRoute>
      <YourComponent />
    </ProtectedRoute>
  );
}
```

## Key Features

### Login Page

- Email and password form with validation
- Password visibility toggle
- "Remember me" checkbox
- "Forgot password?" link
- Google OAuth option
- Sign up link for new users
- Real-time error display
- Loading states during authentication

### Dashboard

- Personalized welcome message
- Quick stats: swap points and skills count
- Skills management panel
- Recommendations section
- Active sessions display
- Responsive grid layout
- Sign out button
- Empty state guidance

### Styling

- Green color palette: #051F20 (dark) to #DAF1DE (light)
- Tailwind CSS for responsive design
- shadcn/ui components for consistency
- Smooth transitions and hover effects
- Mobile-first responsive breakpoints

## Security

- RLS policies prevent unauthorized data access
- Passwords validated on client and server
- Supabase handles secure password storage
- Session management via Supabase Auth
- Protected routes redirect to login
- Google OAuth integrated securely

## TypeScript Types

Types are defined in `lib/supabase.ts`:

```typescript
export type UserProfile = {
  id: string;
  full_name: string | null;
  bio: string | null;
  swap_points: number;
  skills_count: number;
  created_at: string;
  updated_at: string;
};

export type Skill = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  category: string | null;
  skill_type: 'teach' | 'learn';
  proficiency_level: 'beginner' | 'intermediate' | 'advanced';
  created_at: string;
  updated_at: string;
};

export type SkillSwapSession = {
  id: string;
  user_a_id: string;
  user_b_id: string;
  skill_a_id: string;
  skill_b_id: string;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  scheduled_at: string | null;
  duration_minutes: number;
  notes: string | null;
  created_at: string;
};
```

## Environment Variables

Required environment variables (in `.env`):

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

These are used by `lib/supabase.ts` to initialize the Supabase client.

## Usage Examples

### Fetching User Data

```typescript
const { data: userProfile } = await supabase
  .from('user_profiles')
  .select('*')
  .eq('id', user.id)
  .single();
```

### Creating a Skill

```typescript
const { error } = await supabase
  .from('skills')
  .insert({
    user_id: user.id,
    name: 'React Development',
    skill_type: 'teach',
    proficiency_level: 'advanced',
  });
```

### Fetching Skills

```typescript
const { data: skills } = await supabase
  .from('skills')
  .select('*')
  .eq('user_id', user.id);
```

### Creating a Session

```typescript
const { error } = await supabase
  .from('skill_swap_sessions')
  .insert({
    user_a_id: currentUserId,
    user_b_id: otherUserId,
    skill_a_id: skillId1,
    skill_b_id: skillId2,
    status: 'scheduled',
    scheduled_at: new Date().toISOString(),
  });
```

## Next Steps

To extend the platform:

1. **Skills Management** - Expand the inline skills setup on `/dashboard` (see `#skills`) with richer tagging, validation, and suggestions
2. **User Profiles** - Build `/dashboard/profile` for viewing and editing user info
3. **Explore** - Extend `/explore` to support filtering, matching, and swap requests
4. **Messaging** - Add real-time chat between users
5. **Reviews** - Add rating and review system for sessions
6. **Notifications** - Implement real-time notifications

## Support

For issues or questions:
- Check Supabase documentation: https://supabase.com/docs
- Review Next.js 14 docs: https://nextjs.org/docs
- Visit Tailwind CSS docs: https://tailwindcss.com/docs
