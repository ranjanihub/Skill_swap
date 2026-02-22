"use client";

import PostDetail from '@/components/post/PostDetail';
import { useParams } from 'next/navigation';

export default function PostPage() {
  const params = useParams();
  const id = params?.id as string | undefined;

  return <PostDetail skillId={id || null} />;
}
