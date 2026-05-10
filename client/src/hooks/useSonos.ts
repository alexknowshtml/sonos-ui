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
  const [scenes, setScenes] = useState<string[]>([]);
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

  const refreshScenes = useCallback(async () => {
    const data = await fetch(`${API}/scenes`).then((r) => r.json());
    if (Array.isArray(data)) setScenes(data);
    else if (data?.scenes) setScenes(data.scenes);
  }, []);

  useEffect(() => {
    Promise.all([refreshRooms(), refreshNowPlaying(), refreshFavs(), refreshScenes()])
      .finally(() => setLoading(false));
  }, []);

  // SSE for real-time updates
  useEffect(() => {
    const es = new EventSource(`${API}/events`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "transport" || data.state) {
          refreshNowPlaying();
        }
        if (data.type === "group" || data.volume !== undefined) {
          refreshRooms();
        }
      } catch {}
    };
    return () => es.close();
  }, []);

  const play = (room = activeRoom) => post("/play", { room });
  const pause = (room = activeRoom) => post("/pause", { room });
  const next = (room = activeRoom) => post("/next", { room });
  const prev = (room = activeRoom) => post("/prev", { room });
  const setVolume = (room: string, level: number) => post("/volume", { room, level });
  const setMute = (room: string, state: boolean) => post("/mute", { room, state });
  const party = () => post("/group/party").then(() => refreshRooms(true));
  const dissolve = (room = activeRoom) => post("/group/dissolve", { room }).then(() => refreshRooms(true));
  const joinGroup = (room: string, to: string) => post("/group/join", { room, to }).then(() => refreshRooms(true));
  const unjoin = (room: string) => post("/group/unjoin", { room }).then(() => refreshRooms(true));
  const solo = (room: string) => post("/group/solo", { room }).then(() => refreshRooms(true));
  const openFavorite = (index: number, room = activeRoom) => post("/favorites/open", { room, index });
  const applyScene = (name: string) => post("/scenes/apply", { name }).then(() => refreshRooms(true));

  return {
    rooms, nowPlaying, favorites, scenes, loading, activeRoom, setActiveRoom,
    play, pause, next, prev, setVolume, setMute,
    party, dissolve, joinGroup, unjoin, solo,
    openFavorite, applyScene,
    refresh: () => { refreshRooms(true); refreshNowPlaying(); },
  };
}
