import { serve, file } from "bun";
import { join } from "path";
import { networkInterfaces } from "os";
import {
  initUpnp, subscribeToRoom, handleNotify,
  getRoomVolume, getRoomMute, setRoomVolume, setRoomMute,
} from "./upnp";
import {
  getRoomsFromDB, upsertRooms,
  getNowPlayingFromDB, upsertNowPlaying,
  getFavoritesFromDB, upsertFavorites,
  getQueueFromDB, upsertQueue,
  updateRoomVolume as dbUpdateRoomVolume,
} from "./db";

const SONOS = `${process.env.HOME}/bin/sonos`;
const PORT = 2650;
const PUBLIC = join(import.meta.dir, "public");

const sseClients = new Set<ReadableStreamDefaultController>();

function getLocalIP(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of (nets[name] ?? [])) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "127.0.0.1";
}

const LOCAL_IP = getLocalIP();

function broadcast(data: object) {
  const msg = new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
  for (const ctrl of sseClients) {
    try { ctrl.enqueue(msg); } catch { sseClients.delete(ctrl); }
  }
}

let roomsCache: { data: any; ts: number } | null = null;
let favCache: { data: any; ts: number } | null = null;

initUpnp(PORT, LOCAL_IP, broadcast, () => roomsCache);

function parseArgs(args: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuote = false;
  for (const ch of args) {
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === " " && !inQuote) { if (current) { result.push(current); current = ""; } }
    else { current += ch; }
  }
  if (current) result.push(current);
  return result;
}

async function sonos(args: string): Promise<any> {
  const proc = Bun.spawn([SONOS, ...parseArgs(args), "--format", "json"], { stdout: "pipe", stderr: "pipe" });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  try { return JSON.parse(text); } catch { return { raw: text.trim() }; }
}

async function sonosPlain(args: string): Promise<string> {
  const proc = Bun.spawn([SONOS, ...parseArgs(args)], { stdout: "pipe", stderr: "pipe" });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return text.trim();
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function err(msg: string, status = 500) { return json({ error: msg }, status); }
async function body(req: Request): Promise<any> { try { return await req.json(); } catch { return {}; } }

function getRoomIP(name: string): string | null {
  if (!roomsCache || !Array.isArray(roomsCache.data)) return null;
  return roomsCache.data.find((r: any) => r.name === name)?.ip ?? null;
}

async function getRooms(force = false) {
  if (!force && roomsCache && Date.now() - roomsCache.ts < 15000) return roomsCache.data;
  const rooms = await sonos("discover");
  if (!Array.isArray(rooms)) { roomsCache = { data: rooms, ts: Date.now() }; return rooms; }

  const [enriched, groupData] = await Promise.all([
    Promise.all(
      rooms.map(async (r: any) => {
        try {
          const [volume, muted] = await Promise.all([getRoomVolume(r.ip), getRoomMute(r.ip)]);
          return { ...r, volume, muted };
        } catch { return r; }
      })
    ),
    sonos("groups").catch(() => null),
  ]);

  // Merge groupId from live group data before DB write
  const memberOf: Record<string, { groupId: string; coordinator: boolean }> = {};
  if (groupData?.groups) {
    for (const g of groupData.groups) {
      for (const m of g.members ?? []) {
        memberOf[m.name] = { groupId: g.id, coordinator: m.isCoordinator ?? false };
      }
    }
  }
  const withGroups = enriched.map((r: any) => ({ ...r, ...memberOf[r.name] }));

  roomsCache = { data: withGroups, ts: Date.now() };
  upsertRooms(withGroups);
  for (const r of withGroups) if (r.ip) subscribeToRoom(r.ip).catch(() => {});
  return withGroups;
}

async function getFavs(force = false) {
  if (!force && favCache && Date.now() - favCache.ts < 60000) return favCache.data;
  const raw = await sonos('favorites list --name "Controller"');
  const items: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
  const data = items.map((entry: any) => {
    const f = entry.item ?? entry;
    return { title: f.title, albumArt: f.albumArtURI || f.albumArt, position: entry.position };
  });
  favCache = { data, ts: Date.now() };
  upsertFavorites(data);
  return data;
}

async function pollNowPlaying() {
  try {
    const status = await sonos('status --name "Controller"');
    upsertNowPlaying(status);
  } catch {}
}

async function fetchAndCacheQueue(room: string) {
  if (!roomsCache) await getRooms();
  const ip = getRoomIP(room);
  const data = await sonos(`queue list --name "${room}"`);
  const items: any[] = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  const tracks = items.map((entry: any) => {
    const t = entry.item ?? entry;
    const rawArt: string = t.albumArtURI ?? t.albumArt ?? "";
    const albumArt = rawArt.startsWith("/") && ip ? `http://${ip}:1400${rawArt}` : rawArt || undefined;
    return { title: t.title, artist: t.artist, album: t.album, albumArt, uri: t.uri };
  });
  upsertQueue(room, tracks);
  return tracks;
}

function startEventStream() {
  const proc = Bun.spawn([SONOS, "watch", "--name", "Controller", "--format", "json"], { stdout: "pipe", stderr: "pipe" });
  async function pump() {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split("\n")) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          broadcast(parsed);
          if (parsed.playbackState || parsed.currentTrack || parsed.state) {
            upsertNowPlaying(parsed);
          }
        } catch {}
      }
    }
    setTimeout(startEventStream, 3000);
  }
  pump().catch(() => setTimeout(startEventStream, 3000));
}

startEventStream();

// Warm DB and start background pollers
getRooms().catch(() => {});
getFavs().catch(() => {});
pollNowPlaying();
fetchAndCacheQueue("Controller").catch(() => {});
setInterval(() => getRooms().catch(() => {}), 60_000);
setInterval(() => getFavs().catch(() => {}), 300_000);
setInterval(pollNowPlaying, 10_000);
setInterval(() => fetchAndCacheQueue("Controller").catch(() => {}), 30_000);

async function serveStatic(path: string): Promise<Response> {
  const filePath = path === "/" ? join(PUBLIC, "index.html") : join(PUBLIC, path);
  const f = file(filePath);
  if (await f.exists()) return new Response(f);
  return new Response(file(join(PUBLIC, "index.html")));
}

serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Allow-Headers": "*" } });
    }

    if (path.startsWith("/upnp/notify/") && req.method === "NOTIFY") {
      handleNotify(path.replace("/upnp/notify/", ""), await req.text());
      return new Response(null, { status: 200 });
    }

    if (path === "/api/events") {
      let ctrl: ReadableStreamDefaultController;
      const stream = new ReadableStream({
        start(c) { ctrl = c; sseClients.add(ctrl); ctrl.enqueue(new TextEncoder().encode(": connected\n\n")); },
        cancel() { sseClients.delete(ctrl); },
      });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "Access-Control-Allow-Origin": "*" } });
    }

    if (path === "/api/art" && req.method === "GET") {
      const artUrl = url.searchParams.get("url");
      if (!artUrl) return err("Missing url param", 400);
      try {
        const res = await fetch(artUrl, { signal: AbortSignal.timeout(5000) });
        return new Response(res.body, { headers: { "Content-Type": res.headers.get("content-type") ?? "image/jpeg", "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" } });
      } catch { return err("Art fetch failed"); }
    }

    if (path.startsWith("/api/")) {
      try {
        if (req.method === "GET") {
          if (path === "/api/rooms") {
            const cached = getRoomsFromDB();
            if (cached.length > 0) return json(cached);
            return json(await getRooms());
          }
          if (path === "/api/rooms/refresh") return json(await getRooms(true));
          if (path === "/api/groups") return json(await sonos("--name Controller group status"));
          if (path === "/api/favorites") {
            const cached = getFavoritesFromDB();
            if (cached.length > 0) return json(cached);
            return json(await getFavs());
          }
          if (path === "/api/queue") {
            const room = url.searchParams.get("room") || "Controller";
            const cached = getQueueFromDB(room);
            if (cached.length > 0) return json(cached);
            return json(await fetchAndCacheQueue(room));
          }
          if (path === "/api/state") {
            return json({ status: getNowPlayingFromDB() });
          }
        }

        if (req.method === "POST") {
          const b = await body(req);
          const room = b.room || "Controller";

          if (path === "/api/play") return json(await sonos(`play --name "${room}"`));
          if (path === "/api/pause") return json(await sonos(`pause --name "${room}"`));
          if (path === "/api/stop") return json(await sonos(`stop --name "${room}"`));
          if (path === "/api/next") return json(await sonos(`next --name "${room}"`));
          if (path === "/api/prev") return json(await sonos(`prev --name "${room}"`));

          if (path === "/api/volume") {
            const level = Math.min(100, Math.max(0, Number(b.level ?? 30)));
            const ip = getRoomIP(room);
            if (ip) {
              await setRoomVolume(ip, level);
              dbUpdateRoomVolume(ip, level);
              if (roomsCache && Array.isArray(roomsCache.data)) {
                const r = roomsCache.data.find((r: any) => r.name === room);
                if (r) r.volume = level;
              }
              return json({ ok: true });
            }
            return json(await sonos(`volume set --name "${room}" ${level}`));
          }

          if (path === "/api/mute") {
            const muted = b.state === true || b.state === "on";
            const ip = getRoomIP(room);
            if (ip) {
              await setRoomMute(ip, muted);
              dbUpdateRoomVolume(ip, undefined, muted);
              if (roomsCache && Array.isArray(roomsCache.data)) {
                const r = roomsCache.data.find((r: any) => r.name === room);
                if (r) r.muted = muted;
              }
              return json({ ok: true });
            }
            return json(await sonos(`mute ${muted ? "on" : "off"} --name "${room}"`));
          }

          if (path === "/api/group/volume") {
            const { groupId, level } = b;
            const target = Math.min(100, Math.max(0, Number(level ?? 30)));
            const rooms = roomsCache?.data ?? [];
            const grouped = rooms.filter((r: any) => r.groupId === groupId);
            if (!grouped.length) return err("Group not found", 404);
            const maxVol = Math.max(...grouped.map((r: any) => r.volume ?? 0));
            await Promise.all(grouped.map(async (r: any) => {
              const newVol = maxVol > 0 ? Math.round(target * ((r.volume ?? 0) / maxVol)) : target;
              await setRoomVolume(r.ip, newVol).catch(() => {});
              r.volume = newVol;
              dbUpdateRoomVolume(r.ip, newVol);
            }));
            return json({ ok: true });
          }

          if (path === "/api/group/party") return json(await sonos('group party --to "Controller"'));
          if (path === "/api/group/dissolve") return json(await sonos(`group dissolve --name "${room}"`));
          if (path === "/api/group/join") return json(await sonos(`group join --name "${room}" --to "${b.to}"`));
          if (path === "/api/group/unjoin") return json(await sonos(`group unjoin --name "${room}"`));
          if (path === "/api/group/solo") return json(await sonos(`group solo --name "${room}"`));

          if (path === "/api/favorites/open") return json(await sonos(`favorites open --name "${room}" --index ${b.index}`));
        }

        return err("Not found", 404);
      } catch (e: any) { return err(e.message ?? "Command failed"); }
    }

    return serveStatic(path);
  },
});

console.log(`Sonos UI running at http://localhost:${PORT} (local IP: ${LOCAL_IP})`);
