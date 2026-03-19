import { NextResponse } from 'next/server';
import { getHistory as getSonarrHistory } from '@/lib/api/sonarr';
import { getHistory as getRadarrHistory } from '@/lib/api/radarr';
import { sanitizeError } from '@/lib/security';

interface HistoryItem {
  id: number;
  type: 'episode' | 'movie';
  title: string;
  date: string;
  eventType: string;
  quality: string;
  size: number | null;
}

export async function GET() {
  const items: HistoryItem[] = [];
  const stats = { importedToday: 0, importedWeek: 0, failed: 0 };

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Fetch Sonarr history
  try {
    const sonarrData = await getSonarrHistory(1, 50);
    for (const r of (sonarrData.records || []) as Record<string, unknown>[]) {
      const eventType = r.eventType as string;
      const date = new Date(r.date as string);
      const quality = (r.quality as { quality?: { name?: string } })?.quality?.name || '';
      const size = ((r.data as Record<string, unknown>)?.size as number) || null;

      if (eventType === 'downloadFolderImported') {
        items.push({
          id: r.id as number,
          type: 'episode',
          title: r.sourceTitle as string,
          date: r.date as string,
          eventType: 'imported',
          quality,
          size,
        });
        if (date >= todayStart) stats.importedToday++;
        if (date >= weekStart) stats.importedWeek++;
      } else if (eventType === 'downloadFailed') {
        items.push({
          id: r.id as number,
          type: 'episode',
          title: r.sourceTitle as string,
          date: r.date as string,
          eventType: 'failed',
          quality,
          size: null,
        });
        stats.failed++;
      }
    }
  } catch {
    // Sonarr may not be available
  }

  // Fetch Radarr history
  try {
    const radarrData = await getRadarrHistory(1, 50);
    for (const r of (radarrData.records || []) as Record<string, unknown>[]) {
      const eventType = r.eventType as string;
      const date = new Date(r.date as string);
      const quality = (r.quality as { quality?: { name?: string } })?.quality?.name || '';
      const size = ((r.data as Record<string, unknown>)?.size as number) || null;

      if (eventType === 'downloadFolderImported') {
        items.push({
          id: (r.id as number) + 100000,
          type: 'movie',
          title: r.sourceTitle as string,
          date: r.date as string,
          eventType: 'imported',
          quality,
          size,
        });
        if (date >= todayStart) stats.importedToday++;
        if (date >= weekStart) stats.importedWeek++;
      } else if (eventType === 'downloadFailed') {
        items.push({
          id: (r.id as number) + 100000,
          type: 'movie',
          title: r.sourceTitle as string,
          date: r.date as string,
          eventType: 'failed',
          quality,
          size: null,
        });
        stats.failed++;
      }
    }
  } catch {
    // Radarr may not be available
  }

  // Sort by date descending and take latest 10
  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const recent = items.slice(0, 10);

  return NextResponse.json({ stats, recent });
}
