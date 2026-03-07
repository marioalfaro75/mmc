export interface RadarrMovie {
  id: number;
  title: string;
  sortTitle: string;
  sizeOnDisk: number;
  status: string;
  overview: string;
  inCinemas: string;
  physicalRelease: string;
  digitalRelease: string;
  images: RadarrImage[];
  website: string;
  year: number;
  hasFile: boolean;
  youTubeTrailerId: string;
  studio: string;
  path: string;
  qualityProfileId: number;
  monitored: boolean;
  minimumAvailability: string;
  isAvailable: boolean;
  folderName: string;
  runtime: number;
  cleanTitle: string;
  imdbId: string;
  tmdbId: number;
  titleSlug: string;
  certification: string;
  genres: string[];
  tags: number[];
  added: string;
  ratings: { votes: number; value: number };
  movieFile: RadarrMovieFile | null;
}

export interface RadarrImage {
  coverType: string;
  url: string;
  remoteUrl: string;
}

export interface RadarrMovieFile {
  id: number;
  movieId: number;
  relativePath: string;
  path: string;
  size: number;
  dateAdded: string;
  quality: {
    quality: { id: number; name: string; resolution: number };
    revision: { version: number; real: number; isRepack: boolean };
  };
  mediaInfo: {
    videoDynamicRangeType: string;
    videoCodec: string;
    audioCodec: string;
    audioChannels: number;
    resolution: string;
  } | null;
}

export interface RadarrCalendarItem {
  id: number;
  title: string;
  sortTitle: string;
  sizeOnDisk: number;
  status: string;
  overview: string;
  inCinemas: string;
  physicalRelease: string;
  digitalRelease: string;
  images: RadarrImage[];
  year: number;
  hasFile: boolean;
  monitored: boolean;
  tmdbId: number;
}

export interface RadarrQueueItem {
  id: number;
  movieId: number;
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

export interface RadarrSystemStatus {
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

export interface RadarrLookupResult {
  title: string;
  sortTitle: string;
  status: string;
  overview: string;
  images: RadarrImage[];
  year: number;
  tmdbId: number;
  titleSlug: string;
  remotePoster: string;
}
