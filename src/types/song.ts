export interface Song {
  path: string;
  fileName: string;
  artist: string;
  title: string;
  album: string;
  genre: string;
  station: string;
  format: "mp3" | "aac";
  durationMs: number;
  sizeBytes: number;
  recordedAt: string;
  isComplete: boolean;
}

export type SongTagsUpdatedPayload = Song;

export interface SongDeletedPayload {
  path: string;
}

export interface SongRenamedPayload {
  oldPath: string;
  newSong: Song;
}
