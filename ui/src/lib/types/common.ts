export interface DownloadItem {
  id: string;
  source: 'torrent' | 'usenet';
  name: string;
  category: 'movies' | 'tv' | 'other';
  status: 'downloading' | 'paused' | 'queued' | 'completed' | 'failed' | 'seeding' | 'extracting';
  progress: number;
  sizeBytes: number;
  downloadedBytes: number;
  speedBytesPerSecond: number;
  etaSeconds: number | null;
  addedAt: string;
  completedAt: string | null;
  seeds: number | null;
  peers: number | null;
  ratio: number | null;
  repairProgress: number | null;
  unpackProgress: number | null;
}

export interface CalendarItem {
  id: string;
  type: 'episode' | 'movie';
  title: string;
  subtitle: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  airDate: string;
  posterUrl: string | null;
  monitored: boolean;
  hasFile: boolean;
  quality: string;
  sourceService: 'sonarr' | 'radarr';
  sourceId: number;
}

export interface DashboardStats {
  movies: number;
  series: number;
  episodes: number;
  diskUsed: string;
  diskFree: string;
}

export interface ServiceHealth {
  name: string;
  status: 'online' | 'offline' | 'degraded';
  version: string | null;
  url: string;
}

export interface VpnStatus {
  connected: boolean;
  ip: string | null;
  country: string | null;
}

export interface ApiError {
  error: string;
  service: string;
  statusCode: number;
}

export interface MediaRequest {
  id: number;
  status: 'pending' | 'approved' | 'available' | 'declined';
  type: 'movie' | 'tv';
  title: string;
  posterUrl: string | null;
  requestedBy: string;
  requestedAt: string;
}
