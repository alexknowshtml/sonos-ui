import { Database } from "bun:sqlite";
import { join } from "path";

const DB_PATH = join(import.meta.dir, "state.db");
export const db = new Database(DB_PATH, { create: true });
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    name TEXT PRIMARY KEY,
    ip TEXT NOT NULL,
    group_id TEXT,
    coordinator INTEGER NOT NULL DEFAULT 0,
    volume INTEGER NOT NULL DEFAULT 30,
    muted INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS now_playing (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    title TEXT,
    artist TEXT,
    album TEXT,
    album_art TEXT,
    state TEXT NOT NULL DEFAULT 'STOPPED',
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS favorites (
    position INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    album_art TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// Ensure now_playing row exists
db.exec(`INSERT OR IGNORE INTO now_playing (id, state) VALUES (1, 'STOPPED')`);

export function getRoomsFromDB(): any[] {
  return db.query("SELECT name, ip, group_id as groupId, coordinator, volume, muted FROM rooms ORDER BY name").all();
}

export function upsertRooms(rooms: any[]): void {
  const stmt = db.prepare(`
    INSERT INTO rooms (name, ip, group_id, coordinator, volume, muted, updated_at)
    VALUES ($name, $ip, $groupId, $coordinator, $volume, $muted, unixepoch())
    ON CONFLICT(name) DO UPDATE SET
      ip = excluded.ip,
      group_id = excluded.group_id,
      coordinator = excluded.coordinator,
      volume = excluded.volume,
      muted = excluded.muted,
      updated_at = unixepoch()
  `);
  const upsertMany = db.transaction((rows: any[]) => {
    for (const r of rows) {
      stmt.run({
        $name: r.name,
        $ip: r.ip,
        $groupId: r.groupId ?? null,
        $coordinator: r.coordinator ? 1 : 0,
        $volume: r.volume ?? 30,
        $muted: r.muted ? 1 : 0,
      });
    }
  });
  upsertMany(rooms);
}

export function updateRoomVolume(ip: string, volume?: number, muted?: boolean): void {
  if (volume !== undefined && muted !== undefined) {
    db.query("UPDATE rooms SET volume = $v, muted = $m, updated_at = unixepoch() WHERE ip = $ip")
      .run({ $v: volume, $m: muted ? 1 : 0, $ip: ip });
  } else if (volume !== undefined) {
    db.query("UPDATE rooms SET volume = $v, updated_at = unixepoch() WHERE ip = $ip")
      .run({ $v: volume, $ip: ip });
  } else if (muted !== undefined) {
    db.query("UPDATE rooms SET muted = $m, updated_at = unixepoch() WHERE ip = $ip")
      .run({ $m: muted ? 1 : 0, $ip: ip });
  }
}

export function getNowPlayingFromDB(): any {
  return db.query("SELECT title, artist, album, album_art as albumArt, state FROM now_playing WHERE id = 1").get();
}

export function upsertNowPlaying(data: any): void {
  db.query(`
    UPDATE now_playing SET
      title = $title, artist = $artist, album = $album,
      album_art = $albumArt, state = $state, updated_at = unixepoch()
    WHERE id = 1
  `).run({
    $title: data.currentTrack?.title ?? data.title ?? null,
    $artist: data.currentTrack?.artist ?? data.artist ?? null,
    $album: data.currentTrack?.album ?? data.album ?? null,
    $albumArt: data.currentTrack?.albumArtURI ?? data.albumArt ?? null,
    $state: data.playbackState ?? data.state ?? "STOPPED",
  });
}

export function getFavoritesFromDB(): any[] {
  return db.query("SELECT position, title, album_art as albumArt FROM favorites ORDER BY position").all();
}

export function upsertFavorites(favs: any[]): void {
  const stmt = db.prepare(`
    INSERT INTO favorites (position, title, album_art, updated_at)
    VALUES ($position, $title, $albumArt, unixepoch())
    ON CONFLICT(position) DO UPDATE SET
      title = excluded.title, album_art = excluded.album_art, updated_at = unixepoch()
  `);
  const upsertMany = db.transaction((rows: any[]) => {
    db.exec("DELETE FROM favorites");
    for (const r of rows) {
      stmt.run({ $position: r.position, $title: r.title ?? "", $albumArt: r.albumArt ?? null });
    }
  });
  upsertMany(favs);
}
