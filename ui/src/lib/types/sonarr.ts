export interface SonarrSeries {
  id: number;
  title: string;
  sortTitle: string;
  status: string;
  overview: string;
  network: string;
  airTime: string;
  images: SonarrImage[];
  seasons: SonarrSeason[];
  year: number;
  path: string;
  qualityProfileId: number;
  seasonFolder: boolean;
  monitored: boolean;
  runtime: number;
  tvdbId: number;
  tvRageId: number;
  tvMazeId: number;
  firstAired: string;
  seriesType: string;
  cleanTitle: string;
  titleSlug: string;
  certification: string;
  genres: string[];
  tags: number[];
  added: string;
  nextAiring?: string;
  ratings: { votes: number; value: number };
  statistics: SonarrStatistics;
}

export interface SonarrImage {
  coverType: string;
  url: string;
  remoteUrl: string;
}

export interface SonarrSeason {
  seasonNumber: number;
  monitored: boolean;
  statistics: SonarrStatistics;
}

export interface SonarrStatistics {
  seasonCount?: number;
  episodeFileCount: number;
  episodeCount: number;
  totalEpisodeCount: number;
  sizeOnDisk: number;
  percentOfEpisodes: number;
}

export interface SonarrEpisode {
  id: number;
  seriesId: number;
  tvdbId: number;
  episodeFileId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  airDate: string;
  airDateUtc: string;
  overview: string;
  hasFile: boolean;
  monitored: boolean;
}

export interface SonarrCalendarItem {
  id: number;
  seriesId: number;
  tvdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  airDate: string;
  airDateUtc: string;
  hasFile: boolean;
  monitored: boolean;
  series: SonarrSeries;
}

export interface SonarrQueueItem {
  id: number;
  seriesId: number;
  episodeId: number;
  title: string;
  status: string;
  size: number;
  sizeleft: number;
  timeleft: string;
  estimatedCompletionTime: string;
  downloadClient: string;
  indexer: string;
  protocol: string;
}

export interface SonarrSystemStatus {
  appName: string;
  instanceName: string;
  version: string;
  buildTime: string;
  isDebug: boolean;
  isProduction: boolean;
  isAdmin: boolean;
  isUserInteractive: boolean;
  startupPath: string;
  appData: string;
  osName: string;
  osVersion: string;
  isNetCore: boolean;
  isDocker: boolean;
}

export interface SonarrLookupResult {
  title: string;
  sortTitle: string;
  status: string;
  overview: string;
  images: SonarrImage[];
  seasons: SonarrSeason[];
  year: number;
  tvdbId: number;
  titleSlug: string;
  network: string;
  remotePoster: string;
}
