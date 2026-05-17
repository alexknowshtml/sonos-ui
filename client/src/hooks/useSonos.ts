import { useState, useEffect, useCallback, useRef } from "react";

export interface Room {
  name: string;
  ip: string;
  coordinator?: boolean;
  groupId?: string;
  volume?: number;
  muted?: boolean;
  state?: string;
}

export interface NowPlaying {
  title?: string;
  artist?: string;
  album?: string;
  albumArt?: string;
  state?: string;
  room?: string;
  positionSec?: number;
  durationSec?: number;
}

export interface QueueTrack {
  title?: string;
  artist?: string;
  album?: string;
  albumArt?: string;
  uri?: string;
  duration?: number;
}

const API = "/api";

async function post(path: string, body: any = {}) {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export function useSonos() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying>({});
  const [favorites, setFavorites] = useState<any[]>([]);
  const [queue, setQueue] = useState<QueueTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRoom, setActiveRoom] = useState("Controller");
  const [commandPending, setCommandPending] = useState(false);
  const [livePosition, setLivePosition] = useState<number | undefined>(undefined);
  const [commandError, setCommandError] = useState<string | null>(null);

  // Ref so poll-until-changed closure always reads latest state
  const nowPlayingRef = useRef<NowPlaying>({});
  const commandPendingRef = useRef(false);
  const livePositionRef = useRef<number | undefined>(undefined);

  const applyGroupData = (rooms: Room[], groupData: any): Room[] => {
    if (!groupData?.groups) return rooms;
    const memberOf: Record<string, { groupId: string; coordinator: boolean }> = {};
    for (const g of groupData.groups) {
      for (const m of g.members ?? []) {
        memberOf[m.name] = { groupId: g.id, coordinator: m.isCoordinator ?? false };
      }
    }
    return rooms.map((r) => ({ ...r, ...memberOf[r.name] }));
  };

  const refreshRooms = useCallback(async (force = false) => {
    const path = force ? "/rooms/refresh" : "/rooms";
    const roomData = await fetch(`${API}${path}`).then((r) => r.json());
    const rooms: Room[] = Array.isArray(roomData) ? roomData : roomData?.zones ?? [];
    setRooms(rooms);
    fetch(`${API}/groups`).then((r) => r.json())
      .then((gd) => setRooms((prev) => applyGroupData(prev, gd)))
      .catch(() => {});
  }, []);

  const refreshNowPlaying = useCallback(async () => {
    try {
      const data = await fetch(`${API}/state`).then((r) => r.json());
      if (data.status) {
        setNowPlaying(data.status);
        nowPlayingRef.current = data.status;
        if (data.status.positionSec !== undefined && data.status.positionSec > 0) {
          livePositionRef.current = data.status.positionSec;
          setLivePosition(data.status.positionSec);
        }
        return data.status as NowPlaying;
      }
    } catch {}
    return null;
  }, []);

  const refreshFavs = useCallback(async () => {
    const data = await fetch(`${API}/favorites`).then((r) => r.json());
    if (Array.isArray(data)) setFavorites(data);
    else if (data?.favorites) setFavorites(data.favorites);
  }, []);

  const fetchQueue = useCallback(async (room?: string) => {
    const r = room ?? activeRoom;
    try {
      const data = await fetch(`${API}/queue?room=${encodeURIComponent(r)}`).then((res) => res.json());
      setQueue(Array.isArray(data) ? data : []);
    } catch { setQueue([]); }
  }, [activeRoom]);

  useEffect(() => {
    Promise.all([refreshRooms(), refreshNowPlaying(), refreshFavs()])
      .finally(() => setLoading(false));
  }, []);

  // Background heartbeat — catches any SSE misses
  useEffect(() => {
    const id = setInterval(() => refreshNowPlaying(), 12000);
    return () => clearInterval(id);
  }, [refreshNowPlaying]);

  // Tick position forward every second while playing
  useEffect(() => {
    const id = setInterval(() => {
      const np = nowPlayingRef.current;
      if (np.state !== "PLAYING" || livePositionRef.current === undefined || np.durationSec === undefined) return;
      const next = Math.min(livePositionRef.current + 1, np.durationSec);
      livePositionRef.current = next;
      setLivePosition(next);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Refresh on tab focus — covers device wake / background
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshNowPlaying();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshNowPlaying]);

  // SSE for real-time updates
  useEffect(() => {
    const es = new EventSource(`${API}/events`);
    es.onopen = () => refreshNowPlaying();
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "volume") {
          setRooms((prev) => prev.map((r) =>
            r.name === data.room
              ? { ...r, ...(data.volume !== undefined ? { volume: data.volume } : {}), ...(data.mute !== undefined ? { muted: data.mute } : {}) }
              : r
          ));
        } else if (data.type === "transport" || data.state || data.playbackState || data.currentTrack) {
          refreshNowPlaying();
        } else if (data.type === "group" || data.volume !== undefined) {
          refreshRooms();
        }
      } catch {}
    };
    return () => es.close();
  }, []);

  const failCommand = useCallback((msg: string) => {
    setCommandPending(false);
    commandPendingRef.current = false;
    setCommandError(msg);
  }, []);

  // Poll every 1.5s until state changes from snapshot, then clear pending.
  // Bails with error after 25s — handles silent Sonos failures.
  const pollUntilChanged = useCallback((snapshot: NowPlaying) => {
    let elapsed = 0;
    const id = setInterval(async () => {
      elapsed += 1500;
      const fresh = await refreshNowPlaying();
      if (!fresh) return;
      const changed = fresh.title !== snapshot.title || fresh.state !== snapshot.state;
      if (changed || !commandPendingRef.current) {
        clearInterval(id);
        setCommandPending(false);
        commandPendingRef.current = false;
      } else if (elapsed >= 25000) {
        clearInterval(id);
        failCommand("Sonos didn't respond — it may have failed silently");
      }
    }, 1500);
  }, [refreshNowPlaying, failCommand]);

  const withPending = useCallback((fn: () => Promise<any>, waitForChange = false) => {
    const snapshot = { ...nowPlayingRef.current };
    setCommandPending(true);
    setCommandError(null);
    commandPendingRef.current = true;
    return fn()
      .then((res: any) => {
        if (res?.error) {
          failCommand(res.error);
          return;
        }
        if (waitForChange) {
          pollUntilChanged(snapshot);
        } else {
          setCommandPending(false);
          commandPendingRef.current = false;
        }
      })
      .catch((e: any) => failCommand(e?.message ?? "Command failed"));
  }, [pollUntilChanged, failCommand]);

  const setVolume = (room: string, level: number) => {
    setRooms((prev) => prev.map((r) => r.name === room ? { ...r, volume: level } : r));
    return post("/volume", { room, level });
  };

  const setMute = (room: string, state: boolean) => {
    setRooms((prev) => prev.map((r) => r.name === room ? { ...r, muted: state } : r));
    return post("/mute", { room, state });
  };

  const setGroupVolume = (groupId: string, level: number) => {
    setRooms((prev) => prev.map((r) => {
      if (r.groupId !== groupId) return r;
      const groupRooms = prev.filter((x) => x.groupId === groupId);
      const maxVol = Math.max(...groupRooms.map((x) => x.volume ?? 0));
      const newVol = maxVol > 0 ? Math.round(level * ((r.volume ?? 0) / maxVol)) : level;
      return { ...r, volume: Math.min(100, Math.max(0, newVol)) };
    }));
    return post("/group/volume", { groupId, level });
  };

  const play = (room = activeRoom) => withPending(() => post("/play", { room }));
  const pause = (room = activeRoom) => withPending(() => post("/pause", { room }));
  const next = (room = activeRoom) => withPending(() => post("/next", { room }), true);
  const prev = (room = activeRoom) => withPending(() => post("/prev", { room }), true);
  const party = () => post("/group/party").then(() => refreshRooms(true));
  const dissolve = (room = activeRoom) => post("/group/dissolve", { room }).then(() => refreshRooms(true));
  const joinGroup = (room: string, to: string) => post("/group/join", { room, to }).then(() => refreshRooms(true));
  const unjoin = (room: string) => post("/group/unjoin", { room }).then(() => refreshRooms(true));
  const solo = (room: string) => post("/group/solo", { room }).then(() => refreshRooms(true));
  const seek = (position: number, room = activeRoom) => {
    livePositionRef.current = position;
    setLivePosition(position);
    return post("/seek", { room, position });
  };
  const openFavorite = (index: number, room = activeRoom) => {
    const snapshot = { ...nowPlayingRef.current };
    setCommandPending(true);
    setCommandError(null);
    commandPendingRef.current = true;
    return post("/favorites/open", { room, index })
      .then((res: any) => {
        if (res?.error) { failCommand(res.error); return; }
        pollUntilChanged(snapshot);
      })
      .catch((e: any) => failCommand(e?.message ?? "Failed to open favorite"));
  };
  const dismissError = () => setCommandError(null);

  return {
    rooms, nowPlaying, favorites, queue, loading, activeRoom, setActiveRoom,
    commandPending, commandError, dismissError, livePosition,
    play, pause, next, prev, setVolume, setMute, setGroupVolume,
    party, dissolve, joinGroup, unjoin, solo,
    openFavorite, fetchQueue, seek,
    refresh: () => { refreshRooms(true); refreshNowPlaying(); },
  };
}
