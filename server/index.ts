import { serve, file } from "bun";
import { join } from "path";
import { networkInterfaces } from "os";
import {
  initUpnp, subscribeToRoom, handleNotify, ipForSid,
  getRoomVolume, getRoomMute, setRoomVolume, setRoomMute,
} from "./upnp";
import {
  getRoomsFromDB, upsertRooms,
  getNowPlayingFromDB, upsertNowPlaying,
  getFavoritesFromDB, upsertFavorites,
  getQueueFromDB, upsertQueue,
  updateRoomVolume as dbUpdateRoomVolume,
  getKV, setKV,
} from "./db";

const SONOS = `${process.env.HOME}/bin/sonos`;
const YT_DLP = `${process.env.HOME}/bin/yt-dlp`;
const PORT = 2650;

const ytUrlCache = new Map<string, { url: string; expires: number }>();
const YT_URL_TTL_MS = 4 * 60 * 60 * 1000;

// Short-lived proxy tokens for Sonos to stream through this server
const streamProxies = new Map<string, { url: string; expires: number }>();

const INVIDIOUS = [
  "https://inv.bp.projectsegfault.net",
  "https://invidious.nerdvpn.de",
  "https://iv.melmac.space",
];

async function resolveViaInvidious(videoId: string): Promise<string | null> {
  try {
    return await Promise.any(
      INVIDIOUS.map(async (base) => {
        const res = await fetch(`${base}/api/v1/videos/${videoId}`, {
          signal: AbortSignal.timeout(6000),
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (!res.ok) throw new Error("not ok");
        const data: any = await res.json();
        const audio = ((data.adaptiveFormats ?? []) as any[])
          .filter((f) => f.type?.startsWith("audio/"))
          .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
        if (!audio?.url) throw new Error("no audio");
        return audio.url as string;
      })
    );
  } catch { return null; }
}

async function resolveYtUrl(videoId: string): Promise<string | null> {
  const cached = ytUrlCache.get(videoId);
  if (cached && cached.expires > Date.now()) {
    console.log(`[yt] cache hit for ${videoId}`);
    return cached.url;
  }

  console.log(`[yt] resolving ${videoId} via Invidious...`);
  const t0 = Date.now();
  const invUrl = await resolveViaInvidious(videoId);
  if (invUrl) {
    console.log(`[yt] Invidious OK in ${Date.now() - t0}ms`);
    ytUrlCache.set(videoId, { url: invUrl, expires: Date.now() + YT_URL_TTL_MS });
    return invUrl;
  }
  console.log(`[yt] Invidious failed in ${Date.now() - t0}ms, falling back to yt-dlp`);

  const DENO = `${process.env.HOME}/.deno/bin/deno`;
  const t1 = Date.now();
  const proc = Bun.spawn(
    [YT_DLP, "--js-runtimes", `deno:${DENO}`, "-f", "bestaudio[ext=m4a]/bestaudio[acodec=aac]/bestaudio",
     "--no-playlist", "--get-url", `https://music.youtube.com/watch?v=${videoId}`],
    { stdout: "pipe", stderr: "pipe" }
  );
  const raw = (await new Response(proc.stdout).text()).trim().split("\n")[0];
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;
  console.log(`[yt] yt-dlp finished in ${Date.now() - t1}ms, got: ${raw?.slice(0, 60) || "nothing"}`);
  if (stderr) console.log(`[yt] yt-dlp stderr: ${stderr.slice(0, 200)}`);
  if (raw?.startsWith("http")) {
    ytUrlCache.set(videoId, { url: raw, expires: Date.now() + YT_URL_TTL_MS });
    return raw;
  }
  return null;
}
async function getYtAccessToken(): Promise<string | null> {
  const tokenJson = getKV("yt_tokens");
  if (!tokenJson) return null;
  const tokens = JSON.parse(tokenJson);
  if (tokens.access_token && Date.now() < tokens.expires_at - 60_000) return tokens.access_token;
  const clientId = getKV("yt_client_id") ?? "";
  const clientSecret = getKV("yt_client_secret") ?? "";
  if (!clientId || !clientSecret || !tokens.refresh_token) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const data: any = await res.json();
  tokens.access_token = data.access_token;
  tokens.expires_at = Date.now() + data.expires_in * 1000;
  setKV("yt_tokens", JSON.stringify(tokens));
  return tokens.access_token;
}

async function ytApiGet(endpoint: string): Promise<any> {
  const token = await getYtAccessToken();
  if (!token) throw new Error("not_authorized");
  const res = await fetch(`https://www.googleapis.com/youtube/v3/${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`YouTube API error ${res.status}`);
  return res.json();
}

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
    sonos("group status").catch(() => null),
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

function detectSource(uri: string, albumArt: string): string {
  const u = (uri || "").toLowerCase();
  const a = (albumArt || "").toLowerCase();
  if (u.includes("spotify")) return "Spotify";
  if (u.includes("ihr%3a")) return "iHeart Radio";
  if (u.includes("tunein%3a")) return "TuneIn";
  if (u.includes("sid=174") || u.includes("10062a6c")) return "Tidal";
  if (u.includes("sid=204") || u.includes("radio%3ara")) return "Apple Music";
  if (u.includes("sonosapi-hls-static")) {
    if (a.includes("googleusercontent")) return "YouTube Music";
    return "Streaming";
  }
  if (a.includes("spotifycdn") || a.includes("i.scdn.co") || a.includes("spotify-static")) return "Spotify";
  if (a.includes("resources.tidal.com") || a.includes("smapi.tidal.com")) return "Tidal";
  if (a.includes("mzstatic.com")) return "Apple Music";
  if (a.includes("sonosradio.imgix.net")) return "Sonos Radio";
  if (a.includes("googleusercontent")) return "YouTube Music";
  if (a.includes("partnerid=ihr")) return "iHeart Radio";
  if (a.includes("partnerid=tunein")) return "TuneIn";
  return "Sonos";
}

async function getFavs(force = false) {
  if (!force && favCache && Date.now() - favCache.ts < 60000) return favCache.data;
  const raw = await sonos('favorites list --name "Controller"');
  const items: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
  const data = items.map((entry: any) => {
    const f = entry.item ?? entry;
    const albumArt = f.albumArtURI || f.albumArt || "";
    const uri = f.uri || "";
    return { title: f.title, albumArt: albumArt || undefined, position: entry.position, source: detectSource(uri, albumArt) };
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

          // Translate renderingcontrol volume events — match room by RINCON ID in SID
          if (parsed.service === "renderingcontrol" && parsed.vars?.volume_master !== undefined) {
            const rincon = parsed.sid?.match(/RINCON_[A-F0-9]+/i)?.[0];
            if (rincon && roomsCache && Array.isArray(roomsCache.data)) {
              const room = roomsCache.data.find((r: any) =>
                r.udn?.toUpperCase().includes(rincon.toUpperCase())
              );
              if (room) {
                const vol = parseInt(parsed.vars.volume_master, 10);
                if (!isNaN(vol)) {
                  dbUpdateRoomVolume(room.ip, vol);
                  room.volume = vol;
                  broadcast({ type: "volume", room: room.name, volume: vol });
                  continue;
                }
              }
            }
          }

          // Translate avtransport state change events into typed transport broadcasts
          if (parsed.service === "avtransport" && parsed.vars?.transport_state) {
            broadcast({ type: "transport", state: parsed.vars.transport_state });
            pollNowPlaying();
            continue;
          }

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
  idleTimeout: 120,
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

          if (path === "/api/yt/search") {
            const q = url.searchParams.get("q");
            if (!q) return err("Missing q param", 400);
            const searchToken = await getYtAccessToken();
            if (!searchToken) return err("Not authorized", 401);
            const ytUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&videoCategoryId=10&maxResults=20`;
            const res = await fetch(ytUrl, { headers: { Authorization: `Bearer ${searchToken}` }, signal: AbortSignal.timeout(8000) });
            const data: any = await res.json();
            if (!res.ok) return err(data?.error?.message ?? "YouTube search failed", res.status);
            const items = (data.items ?? []).map((item: any) => ({
              videoId: item.id?.videoId,
              title: item.snippet?.title ?? "",
              artist: item.snippet?.channelTitle ?? "",
              thumbnail: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url,
            })).filter((i: any) => i.videoId);
            // Pre-warm #1 result in background using full resolution (so first tap is instant)
            const topItem = items[0];
            if (topItem && !ytUrlCache.has(topItem.videoId)) {
              resolveYtUrl(topItem.videoId).catch(() => {});
            }
            // Try Invidious-only for results 2-5 (fast, best-effort)
            for (const item of items.slice(1, 5)) {
              if (!ytUrlCache.has(item.videoId)) {
                resolveViaInvidious(item.videoId).then(url => {
                  if (url) ytUrlCache.set(item.videoId, { url, expires: Date.now() + YT_URL_TTL_MS });
                }).catch(() => {});
              }
            }
            return json(items);
          }

          if (path === "/api/yt/auth" || path === "/api/yt/auth/poll") {
            const tokenJson = getKV("yt_tokens");
            const authorized = !!(tokenJson && JSON.parse(tokenJson).refresh_token);
            return json({ authorized });
          }

          if (path === "/api/yt/auth/status") {
            const tokenJson = getKV("yt_tokens");
            const authorized = !!(tokenJson && JSON.parse(tokenJson).refresh_token);
            return json({ authorized });
          }

          if (path.startsWith("/api/yt/stream/")) {
            const token = path.split("/")[4]; // /api/yt/stream/TOKEN/title.m4a
            const entry = token ? streamProxies.get(token) : null;
            if (!entry || entry.expires < Date.now()) {
              console.log(`[stream] token not found or expired: ${token}`);
              return new Response("Stream expired", { status: 410 });
            }
            console.log(`[stream] proxying token ${token?.slice(0, 8)}...`);
            try {
              const rangeHeader = req.headers.get("Range");
              const upstream = await fetch(entry.url, {
                headers: rangeHeader ? { Range: rangeHeader } : {},
                signal: AbortSignal.timeout(10000),
              });
              const headers: Record<string, string> = {
                "Content-Type": upstream.headers.get("Content-Type") ?? "audio/webm",
                "Accept-Ranges": "bytes",
              };
              const cl = upstream.headers.get("Content-Length");
              const cr = upstream.headers.get("Content-Range");
              if (cl) headers["Content-Length"] = cl;
              if (cr) headers["Content-Range"] = cr;
              return new Response(upstream.body, { status: upstream.status, headers });
            } catch (e: any) {
              console.log(`[stream] proxy error: ${e.message}`);
              return new Response("Upstream error", { status: 502 });
            }
          }

          if (path === "/api/yt/playlists") {
            try {
              const likedPlaylist = {
                id: "LL",
                title: "Liked Songs",
                thumbnail: null,
                itemCount: null,
              };
              const data = await ytApiGet("playlists?part=snippet,contentDetails&mine=true&maxResults=50");
              const playlists = (data.items ?? []).map((item: any) => ({
                id: item.id,
                title: item.snippet?.title ?? "",
                thumbnail: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
                itemCount: item.contentDetails?.itemCount ?? null,
              }));
              return json([likedPlaylist, ...playlists]);
            } catch (e: any) {
              if (e.message === "not_authorized") return err("Not authorized", 401);
              throw e;
            }
          }

          if (path.startsWith("/api/yt/playlist/")) {
            const playlistId = path.replace("/api/yt/playlist/", "");
            if (!playlistId) return err("Missing playlist ID", 400);
            try {
              const pageToken = url.searchParams.get("pageToken") ?? "";
              const ptParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
              const data = await ytApiGet(`playlistItems?part=snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=50${ptParam}`);
              const items = (data.items ?? [])
                .map((item: any) => ({
                  videoId: item.snippet?.resourceId?.videoId,
                  title: item.snippet?.title ?? "",
                  artist: item.snippet?.videoOwnerChannelTitle ?? "",
                  thumbnail: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
                }))
                .filter((i: any) => i.videoId && i.title !== "Deleted video" && i.title !== "Private video");
              // Pre-warm first result
              if (items[0] && !ytUrlCache.has(items[0].videoId)) {
                resolveYtUrl(items[0].videoId).catch(() => {});
              }
              return json({ items, nextPageToken: data.nextPageToken ?? null });
            } catch (e: any) {
              if (e.message === "not_authorized") return err("Not authorized", 401);
              throw e;
            }
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
            await sonos(`volume set --name "${room}" ${level}`);
            const ip = getRoomIP(room);
            if (ip) dbUpdateRoomVolume(ip, level);
            if (roomsCache && Array.isArray(roomsCache.data)) {
              const r = roomsCache.data.find((r: any) => r.name === room);
              if (r) r.volume = level;
            }
            return json({ ok: true });
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

          if (path === "/api/yt/play") {
            const { videoId, room: r, title } = b;
            if (!videoId) return err("Missing videoId", 400);
            const targetRoom = r || "Controller";
            const streamUrl = await resolveYtUrl(videoId);
            if (!streamUrl) return err("Could not resolve stream URL");
            const titleFlag = title ? ` --title "${title.replace(/"/g, '\\"')}"` : "";
            await sonos(`play-uri "${streamUrl}" --name "${targetRoom}"${titleFlag}`);
            return json({ ok: true });
          }

          if (path === "/api/yt/queue") {
            const { videoId, room: r, title } = b;
            if (!videoId) return err("Missing videoId", 400);
            const targetRoom = r || "Controller";
            console.log(`[queue] request: videoId=${videoId} room=${targetRoom} title=${title}`);
            if (!roomsCache) await getRooms();
            const ip = getRoomIP(targetRoom);
            if (!ip) { console.log(`[queue] room not found: ${targetRoom}`); return err("Room not found"); }
            console.log(`[queue] room ${targetRoom} = ${ip}, resolving URL...`);
            const t0 = Date.now();
            const streamUrl = await resolveYtUrl(videoId);
            console.log(`[queue] URL resolved in ${Date.now() - t0}ms: ${streamUrl ? "ok" : "FAILED"}`);
            if (!streamUrl) return err("Could not resolve stream URL");
            // Sonos can't reach googlevideo.com directly — proxy through this server
            const token = crypto.randomUUID();
            streamProxies.set(token, { url: streamUrl, expires: Date.now() + YT_URL_TTL_MS });
            const slug = (title ?? videoId).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || videoId;
            const proxyUrl = `http://${LOCAL_IP}:${PORT}/api/yt/stream/${token}/${encodeURIComponent(slug)}.m4a`;
            console.log(`[queue] proxy URL: ${proxyUrl}`);
            const safeTitle = (title ?? videoId).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
            const didl = `&lt;DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"&gt;&lt;item id="0" parentID="0" restricted="1"&gt;&lt;dc:title&gt;${safeTitle}&lt;/dc:title&gt;&lt;upnp:class&gt;object.item.audioItem.musicTrack&lt;/upnp:class&gt;&lt;res protocolInfo="http-get:*:audio/mp4:*"&gt;${proxyUrl}&lt;/res&gt;&lt;/item&gt;&lt;/DIDL-Lite&gt;`;
            const soapBody = `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:AddURIToQueue xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><EnqueuedURI>${proxyUrl}</EnqueuedURI><EnqueuedURIMetaData>${didl}</EnqueuedURIMetaData><DesiredFirstTrackNumberEnqueued>0</DesiredFirstTrackNumberEnqueued><EnqueueAsNext>0</EnqueueAsNext></u:AddURIToQueue></s:Body></s:Envelope>`;
            console.log(`[queue] sending AddURIToQueue to ${ip}:1400`);
            const res = await fetch(`http://${ip}:1400/MediaRenderer/AVTransport/Control`, {
              method: "POST",
              headers: { "Content-Type": 'text/xml; charset="utf-8"', SOAPAction: '"urn:schemas-upnp-org:service:AVTransport:1#AddURIToQueue"' },
              body: soapBody,
              signal: AbortSignal.timeout(5000),
            });
            const resBody = await res.text();
            console.log(`[queue] SOAP response: ${res.status} — ${resBody.slice(0, 300)}`);
            if (!res.ok) return err(`Failed to queue track (${res.status}): ${resBody.slice(0, 200)}`);
            return json({ ok: true });
          }

          if (path === "/api/seek") {
            const sec = Math.max(0, Math.round(Number(b.position ?? 0)));
            const h = Math.floor(sec / 3600);
            const m = Math.floor((sec % 3600) / 60);
            const s = sec % 60;
            const tc = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
            return json(await sonos(`seek --name "${room}" --time "${tc}"`));
          }
        }

        return err("Not found", 404);
      } catch (e: any) { return err(e.message ?? "Command failed"); }
    }

    return serveStatic(path);
  },
});

console.log(`Sonos UI running at http://localhost:${PORT} (local IP: ${LOCAL_IP})`);
