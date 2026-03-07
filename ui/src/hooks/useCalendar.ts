'use client';

import { useQuery } from '@tanstack/react-query';
import { POLLING, STALE_TIME } from '@/lib/utils/polling';
import type { CalendarItem } from '@/lib/types/common';

export function useCalendar(start: string, end: string) {
  return useQuery<CalendarItem[]>({
    queryKey: ['calendar', { start, end }],
    queryFn: () =>
      fetch(`/api/calendar?start=${start}&end=${end}`).then(r => r.json()),
    refetchInterval: POLLING.CALENDAR,
    staleTime: STALE_TIME.CALENDAR,
  });
}
