'use client';

import { MediaCardSkeleton } from '@/components/common/Skeleton';

interface MediaGridProps {
  children: React.ReactNode;
  isLoading?: boolean;
  skeletonCount?: number;
}

export function MediaGrid({ children, isLoading, skeletonCount = 20 }: MediaGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <MediaCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {children}
    </div>
  );
}
