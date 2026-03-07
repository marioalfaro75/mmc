import { NextResponse } from 'next/server';
import { getSeries } from '@/lib/api/sonarr';
import { getMovies } from '@/lib/api/radarr';
import type { DashboardStats } from '@/lib/types/common';

export async function GET() {
  try {
    const [series, movies] = await Promise.allSettled([
      getSeries(),
      getMovies(),
    ]);

    const seriesData = series.status === 'fulfilled' ? series.value : [];
    const moviesData = movies.status === 'fulfilled' ? movies.value : [];

    const totalEpisodes = seriesData.reduce(
      (acc, s) => acc + (s.statistics?.episodeFileCount || 0),
      0
    );

    const moviesDiskUsed = moviesData.reduce((acc, m) => acc + (m.sizeOnDisk || 0), 0);
    const seriesDiskUsed = seriesData.reduce(
      (acc, s) => acc + (s.statistics?.sizeOnDisk || 0),
      0
    );

    const stats: DashboardStats = {
      movies: moviesData.length,
      series: seriesData.length,
      episodes: totalEpisodes,
      diskUsed: formatBytes(moviesDiskUsed + seriesDiskUsed),
      diskFree: 'N/A',
    };

    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats', service: 'dashboard', statusCode: 500 },
      { status: 500 }
    );
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
