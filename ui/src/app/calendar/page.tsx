'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Film, Tv, List, Grid3X3, Calendar as CalendarIcon } from 'lucide-react';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Skeleton } from '@/components/common/Skeleton';
import { STALE_TIME, POLLING } from '@/lib/utils/polling';
import { fetchApi } from '@/lib/utils/fetchApi';
import { formatDate, formatEpisode } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import type { CalendarItem } from '@/lib/types/common';

type ViewMode = 'month' | 'week' | 'list';

function getMonthDates(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();
  const dates: Date[] = [];

  for (let i = -startPad; i <= lastDay.getDate() + (6 - lastDay.getDay()) - 1; i++) {
    dates.push(new Date(year, month, i + 1));
  }
  return dates;
}

function getWeekDates(date: Date) {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export default function CalendarPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const start = new Date(year, month - 1, 1).toISOString().split('T')[0];
  const end = new Date(year, month + 2, 0).toISOString().split('T')[0];

  const { data: items = [], isLoading, isError } = useQuery<CalendarItem[]>({
    queryKey: ['calendar', { start, end }],
    queryFn: () => fetchApi<CalendarItem[]>(`/api/calendar?start=${start}&end=${end}`),
    refetchInterval: POLLING.CALENDAR,
    staleTime: STALE_TIME.CALENDAR,
  });

  const navigate = (dir: number) => {
    const next = new Date(currentDate);
    if (viewMode === 'month') next.setMonth(next.getMonth() + dir);
    else next.setDate(next.getDate() + dir * 7);
    setCurrentDate(next);
  };

  const today = new Date().toISOString().split('T')[0];
  const dates = viewMode === 'month' ? getMonthDates(year, month) : getWeekDates(currentDate);

  const itemsByDate = items.reduce<Record<string, CalendarItem[]>>((acc, item) => {
    const dateKey = item.airDate?.split('T')[0];
    if (dateKey) {
      (acc[dateKey] ||= []).push(item);
    }
    return acc;
  }, {});

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Calendar</h1>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {([['month', Grid3X3], ['week', CalendarIcon], ['list', List]] as const).map(([mode, Icon]) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                'rounded-md p-1.5 transition-colors',
                viewMode === mode ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>

      {isError && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          <CalendarDays className="h-4 w-4 shrink-0" />
          Could not load calendar data. Sonarr or Radarr may be unavailable.
        </div>
      )}

      <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="rounded-md p-2 hover:bg-muted transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-semibold">
          {currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </h2>
        <button onClick={() => navigate(1)} className="rounded-md p-2 hover:bg-muted transition-colors">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {viewMode === 'list' ? (
        <div className="space-y-2">
          {isLoading ? (
            Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">No releases in this period</p>
          ) : (
            items.map((item) => (
              <Card key={item.id} className="flex items-center gap-3 p-3">
                {item.type === 'movie' ? (
                  <Film className="h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <Tv className="h-4 w-4 shrink-0 text-success" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {item.title}
                    {item.subtitle && ` - ${item.subtitle}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(item.airDate)}
                    {item.type === 'episode' && ` · ${formatEpisode(item.seasonNumber, item.episodeNumber)}`}
                  </p>
                </div>
                <Badge variant={item.hasFile ? 'success' : 'outline'}>
                  {item.hasFile ? 'Available' : 'Upcoming'}
                </Badge>
              </Card>
            ))
          )}
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-7 gap-px">
            {dayNames.map((day) => (
              <div key={day} className="p-2 text-center text-xs font-medium text-muted-foreground">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px">
            {dates.map((date) => {
              const dateKey = date.toISOString().split('T')[0];
              const dayItems = itemsByDate[dateKey] || [];
              const isToday = dateKey === today;
              const isCurrentMonth = date.getMonth() === month;

              return (
                <div
                  key={dateKey}
                  className={cn(
                    'min-h-[80px] rounded-md border border-border/50 p-1',
                    !isCurrentMonth && 'opacity-40',
                    isToday && 'border-primary bg-primary/5'
                  )}
                >
                  <span className={cn('text-xs', isToday ? 'font-bold text-primary' : 'text-muted-foreground')}>
                    {date.getDate()}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayItems.slice(0, 3).map((item) => (
                      <div
                        key={item.id}
                        className={cn(
                          'truncate rounded px-1 py-0.5 text-[10px]',
                          item.type === 'episode' ? 'bg-success/20 text-success' : 'bg-primary/20 text-primary'
                        )}
                        title={`${item.title}${item.subtitle ? ` - ${item.subtitle}` : ''}`}
                      >
                        {item.title}
                      </div>
                    ))}
                    {dayItems.length > 3 && (
                      <p className="text-[10px] text-muted-foreground">+{dayItems.length - 3} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
