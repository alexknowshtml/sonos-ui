import { serve, file } from "bun";
import { join } from "path";

const SONOS = `${process.env.HOME}/bin/sonos`;
const PORT = 2650;
const PUBLIC = join(import.meta.dir, "public");

// SSE clients watching for real-time events
const sseClients = new Set<ReadableStreamDefaultController>();

function parseArgs(args: string): string[] {
  // Split on spaces but respect double-quoted segments (e.g. --name "Bathroom Hall")
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
  const proc = Bun.spawn([SONOS, ...parseArgs(args), "--format", "json"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.trim() };
  }
}

async function sonosPlain(args: string): Promise<string> {
  const proc = Bun.spawn([SONOS, ...parseArgs(args)], {
    stdout: "pipe",
    stderr: "pipe",
  });
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

function err(msg: string, status = 500) {
  return json({ error: msg }, status);
}

async function body(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

// Start persistent sonos watch process and broadcast to SSE clients
function startEventStream() {
  const proc = Bun.spawn([SONOS, "watch", "--name", "Controller", "--format", "json"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  async function pump() {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        const msg = `data: ${line}\n\n`;
        for (const ctrl of sseClients) {
          try { ctrl.enqueue(new TextEncoder().encode(msg)); } catch { sseClients.delete(ctrl); }
        }
      }
    }
    // Restart on exit
    setTimeout(startEventStream, 3000);
  }
  pump().catch(() => setTimeout(startEventStream, 3000));
}

startEventStream();

// Cache rooms and favorites for 60s
let roomsCache: { data: any; ts: number } | null = null;
let favCache: { data: any; ts: number } | null = null;

async function getRooms(force = false) {
  if (!force && roomsCache && Date.now() - roomsCache.ts < 15000) return roomsCache.data;
  const rooms = await sonos("discover");
  if (!Array.isArray(rooms)) { roomsCache = { data: rooms, ts: Date.now() }; return rooms; }

  // Enrich each room with volume/mute from status (use --ip to avoid space-in-name split bug)
  const enriched = await Promise.all(
    rooms.map(async (r: any) => {
      try {
        const s = await sonos(`--ip ${r.ip} status`);
        return { ...r, volume: s.volume ?? 0, muted: s.mute === true };
      } catch {
        return r;
      }
    })
  );
  roomsCache = { data: enriched, ts: Date.now() };
  return enriched;
}

async function getFavs(force = false) {
  if (!force && favCache && Date.now() - favCache.ts < 60000) return favCache.data;
  const data = await sonos("favorites list");
  favCache = { data, ts: Date.now() };
  return data;
}

async function serveStatic(path: string): Promise<Response> {
  const filePath = path === "/" ? join(PUBLIC, "index.html") : join(PUBLIC, path);
  const f = file(filePath);
  if (await f.exists()) {
    return new Response(f);
  }
  // SPA fallback
  return new Response(file(join(PUBLIC, "index.html")));
}

const server = serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Allow-Headers": "*" } });
    }

    // SSE
    if (path === "/api/events") {
      let ctrl: ReadableStreamDefaultController;
      const stream = new ReadableStream({
        start(c) {
          ctrl = c;
          sseClients.add(ctrl);
          // Send initial heartbeat
          ctrl.enqueue(new TextEncoder().encode(": connected\n\n"));
        },
        cancel() {
          sseClients.delete(ctrl);
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // API routes
    if (path.startsWith("/api/")) {
      try {
        // GET routes
        if (req.method === "GET") {
          if (path === "/api/rooms") return json(await getRooms());
          if (path === "/api/rooms/refresh") return json(await getRooms(true));
          if (path === "/api/groups") return json(await sonos("--name Controller group status"));
          if (path === "/api/favorites") return json(await getFavs());
          if (path === "/api/scenes") return json(await sonos("scene list"));
          if (path === "/api/state") {
            const [rooms, status] = await Promise.all([
              getRooms(),
              sonos("status --name Controller").catch(() => ({})),
            ]);
            return json({ rooms, status });
          }
        }

        // POST routes
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
            return json(await sonos(`volume set --name "${room}" ${level}`));
          }
          if (path === "/api/mute") {
            const state = b.state === true || b.state === "on" ? "on" : "off";
            return json(await sonos(`mute ${state} --name "${room}"`));
          }

          if (path === "/api/group/party") return json(await sonos('group party --to "Controller"'));
          if (path === "/api/group/dissolve") return json(await sonos(`group dissolve --name "${room}"`));
          if (path === "/api/group/join") return json(await sonos(`group join --name "${room}" --to "${b.to}"`));
          if (path === "/api/group/unjoin") return json(await sonos(`group unjoin --name "${room}"`));
          if (path === "/api/group/solo") return json(await sonos(`group solo --name "${room}"`));

          if (path === "/api/favorites/open") {
            return json(await sonos(`favorites open --name "${room}" --index ${b.index}`));
          }
          if (path === "/api/scenes/apply") return json(await sonosPlain(`scene apply ${b.name}`));
          if (path === "/api/scenes/save") return json(await sonosPlain(`scene save ${b.name}`));
        }

        return err("Not found", 404);
      } catch (e: any) {
        return err(e.message ?? "Command failed");
      }
    }

    // Static files
    return serveStatic(path);
  },
});

console.log(`Sonos UI running at http://localhost:${PORT}`);
