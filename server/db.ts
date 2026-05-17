import { Database } from "bun:sqlite";
import { join } from "path";

const DB_PATH = join(import.meta.dir, "state.db");
export const db = new Database(DB_PATH, { create: true });
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA synchronous = NORMAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
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
    position_sec INTEGER,
    duration_sec INTEGER,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS favorites (
    position INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    album_art TEXT,
    source TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS queue (
    room TEXT NOT NULL,
    position INTEGER NOT NULL,
    title TEXT,
    artist TEXT,
    album TEXT,
    album_art TEXT,
    uri TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (room, position)
  );
`);

// Ensure now_playing row exists
db.exec(`INSERT OR IGNORE INTO now_playing (id, state) VALUES (1, 'STOPPED')`);

// Migrate: add source column if it doesn't exist yet
try { db.exec("ALTER TABLE favorites ADD COLUMN source TEXT"); } catch {}
try { db.exec("ALTER TABLE now_playing ADD COLUMN position_sec INTEGER"); } catch {}
try { db.exec("ALTER TABLE now_playing ADD COLUMN duration_sec INTEGER"); } catch {}

export function getKV(key: string): string | null {
  const row = db.query("SELECT value FROM kv WHERE key = $key").get({ $key: key }) as any;
  return row?.value ?? null;
}

export function setKV(key: string, value: string): void {
  db.query(`
    INSERT INTO kv (key, value, updated_at) VALUES ($key, $value, unixepoch())
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()
  `).run({ $key: key, $value: value });
}

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
  return db.query("SELECT title, artist, album, album_art as albumArt, state, position_sec as positionSec, duration_sec as durationSec FROM now_playing WHERE id = 1").get();
}

function parseTimecode(tc: string | undefined): number | null {
  if (!tc) return null;
  const parts = tc.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

export function upsertNowPlaying(data: any): void {
  // sonos status: data.nowPlaying + data.albumArtURL + data.transport.State + data.position
  // sonos watch events: data.currentTrack + data.albumArt + data.playbackState
  const track = data.nowPlaying ?? data.currentTrack ?? {};
  const pos = data.position;
  const positionSec = pos ? parseTimecode(pos.RelTime) : null;
  const durationSec = pos ? parseTimecode(pos.TrackDuration) : null;
  db.query(`
    UPDATE now_playing SET
      title = $title, artist = $artist, album = $album,
      album_art = $albumArt, state = $state,
      position_sec = COALESCE($positionSec, position_sec),
      duration_sec = COALESCE($durationSec, duration_sec),
      updated_at = unixepoch()
    WHERE id = 1
  `).run({
    $title: track.title ?? data.title ?? null,
    $artist: track.artist ?? data.artist ?? null,
    $album: track.album ?? data.album ?? null,
    $albumArt: data.albumArtURL ?? track.albumArtURI ?? track.albumArt ?? data.albumArt ?? null,
    $state: data.transport?.State ?? data.playbackState ?? data.state ?? "STOPPED",
    $positionSec: positionSec,
    $durationSec: durationSec,
  });
}

export function getFavoritesFromDB(): any[] {
  return db.query("SELECT position, title, album_art as albumArt, source FROM favorites ORDER BY position").all();
}

export function getQueueFromDB(room: string): any[] {
  return db.query("SELECT title, artist, album, album_art as albumArt, uri FROM queue WHERE room = $room ORDER BY position").all({ $room: room }) as any[];
}

export function upsertQueue(room: string, tracks: any[]): void {
  const stmt = db.prepare(`
    INSERT INTO queue (room, position, title, artist, album, album_art, uri, updated_at)
    VALUES ($room, $position, $title, $artist, $album, $albumArt, $uri, unixepoch())
    ON CONFLICT(room, position) DO UPDATE SET
      title = excluded.title, artist = excluded.artist, album = excluded.album,
      album_art = excluded.album_art, uri = excluded.uri, updated_at = unixepoch()
  `);
  const upsertMany = db.transaction((rows: any[]) => {
    db.query("DELETE FROM queue WHERE room = $room").run({ $room: room });
    for (let i = 0; i < rows.length; i++) {
      const t = rows[i];
      stmt.run({ $room: room, $position: i, $title: t.title ?? null, $artist: t.artist ?? null, $album: t.album ?? null, $albumArt: t.albumArt ?? null, $uri: t.uri ?? null });
    }
  });
  upsertMany(tracks);
}

export function upsertFavorites(favs: any[]): void {
  const stmt = db.prepare(`
    INSERT INTO favorites (position, title, album_art, source, updated_at)
    VALUES ($position, $title, $albumArt, $source, unixepoch())
    ON CONFLICT(position) DO UPDATE SET
      title = excluded.title, album_art = excluded.album_art, source = excluded.source, updated_at = unixepoch()
  `);
  const upsertMany = db.transaction((rows: any[]) => {
    db.exec("DELETE FROM favorites");
    for (const r of rows) {
      stmt.run({ $position: r.position, $title: r.title ?? "", $albumArt: r.albumArt ?? null, $source: r.source ?? null });
    }
  });
  upsertMany(favs);
}
