import { useState, useEffect, useCallback } from "react";

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

  const refreshRooms = useCallback(async (force = false) => {
    const path = force ? "/rooms/refresh" : "/rooms";
    const [roomData, groupData] = await Promise.all([
      fetch(`${API}${path}`).then((r) => r.json()),
      fetch(`${API}/groups`).then((r) => r.json()).catch(() => null),
    ]);
    let rooms: Room[] = Array.isArray(roomData) ? roomData : roomData?.zones ?? [];

    if (groupData?.groups) {
      const memberOf: Record<string, { groupId: string; coordinator: boolean }> = {};
      for (const g of groupData.groups) {
        for (const m of g.members ?? []) {
          memberOf[m.name] = {
            groupId: g.id,
            coordinator: m.isCoordinator ?? false,
          };
        }
      }
      rooms = rooms.map((r) => ({ ...r, ...memberOf[r.name] }));
    }

    setRooms(rooms);
  }, []);

  const refreshNowPlaying = useCallback(async () => {
    try {
      const data = await fetch(`${API}/state`).then((r) => r.json());
      if (data.status) setNowPlaying(data.status);
    } catch {}
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

  // SSE for real-time updates
  useEffect(() => {
    const es = new EventSource(`${API}/events`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "volume") {
          // Direct volume patch from UPnP GENA push
          setRooms((prev) => prev.map((r) =>
            r.name === data.room
              ? { ...r, ...(data.volume !== undefined ? { volume: data.volume } : {}), ...(data.mute !== undefined ? { muted: data.mute } : {}) }
              : r
          ));
        } else if (data.type === "transport" || data.state) {
          refreshNowPlaying();
        } else if (data.type === "group" || data.volume !== undefined) {
          refreshRooms();
        }
      } catch {}
    };
    return () => es.close();
  }, []);

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

  const play = (room = activeRoom) => post("/play", { room });
  const pause = (room = activeRoom) => post("/pause", { room });
  const next = (room = activeRoom) => post("/next", { room });
  const prev = (room = activeRoom) => post("/prev", { room });
  const party = () => post("/group/party").then(() => refreshRooms(true));
  const dissolve = (room = activeRoom) => post("/group/dissolve", { room }).then(() => refreshRooms(true));
  const joinGroup = (room: string, to: string) => post("/group/join", { room, to }).then(() => refreshRooms(true));
  const unjoin = (room: string) => post("/group/unjoin", { room }).then(() => refreshRooms(true));
  const solo = (room: string) => post("/group/solo", { room }).then(() => refreshRooms(true));
  const openFavorite = (index: number, room = activeRoom) => post("/favorites/open", { room, index });

  return {
    rooms, nowPlaying, favorites, queue, loading, activeRoom, setActiveRoom,
    play, pause, next, prev, setVolume, setMute, setGroupVolume,
    party, dissolve, joinGroup, unjoin, solo,
    openFavorite, fetchQueue,
    refresh: () => { refreshRooms(true); refreshNowPlaying(); },
  };
}
