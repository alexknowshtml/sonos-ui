import { useState, useCallback, useEffect } from "react";
import { SpinnerIcon } from "./Icons";

interface YTTrack {
  videoId: string;
  title: string;
  artist: string;
  thumbnail?: string;
}

interface YTPlaylist {
  id: string;
  title: string;
  thumbnail: string | null;
  itemCount: number | null;
}

interface Props {
  activeRoom: string;
}

function decodeHTML(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

export default function YouTubeMusic({ activeRoom }: Props) {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"search" | "library">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YTTrack[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [playlists, setPlaylists] = useState<YTPlaylist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [currentPlaylist, setCurrentPlaylist] = useState<YTPlaylist | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<YTTrack[]>([]);
  const [playlistNextPage, setPlaylistNextPage] = useState<string | null>(null);
  const [tracksLoading, setTracksLoading] = useState(false);

  useEffect(() => {
    fetch("/api/yt/auth/status")
      .then((r) => r.json())
      .then((d) => setAuthorized(d.authorized))
      .catch(() => setAuthorized(false));
  }, []);

  const connectYT = useCallback(() => {
    const win = window.open("/api/yt/auth", "_blank", "width=600,height=700");
    const poll = setInterval(async () => {
      const res = await fetch("/api/yt/auth/status").then((r) => r.json()).catch(() => ({}));
      if (res.authorized) {
        clearInterval(poll);
        win?.close();
        setAuthorized(true);
      }
    }, 2000);
  }, []);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setSearchLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/yt/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setResults(data);
    } catch (e: any) {
      setError(e.message);
      setResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [query]);

  const loadPlaylists = useCallback(async () => {
    setPlaylistsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/yt/playlists");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load playlists");
      setPlaylists(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPlaylistsLoading(false);
    }
  }, []);

  const openPlaylist = useCallback(async (playlist: YTPlaylist, pageToken?: string) => {
    if (!pageToken) {
      setCurrentPlaylist(playlist);
      setPlaylistTracks([]);
      setPlaylistNextPage(null);
    }
    setTracksLoading(true);
    setError(null);
    try {
      const pt = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : "";
      const res = await fetch(`/api/yt/playlist/${encodeURIComponent(playlist.id)}${pt}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load playlist");
      setPlaylistTracks((prev) => pageToken ? [...prev, ...data.items] : data.items);
      setPlaylistNextPage(data.nextPageToken ?? null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setTracksLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "library" && authorized && playlists.length === 0 && !playlistsLoading) {
      loadPlaylists();
    }
  }, [tab, authorized]);

  const play = useCallback(async (track: YTTrack) => {
    setPlaying(track.videoId);
    try {
      await fetch("/api/yt/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: track.videoId, room: activeRoom }),
      });
    } finally {
      setPlaying(null);
    }
  }, [activeRoom]);

  if (authorized === null) {
    return (
      <div style={{ padding: 32, display: "flex", justifyContent: "center" }}>
        <SpinnerIcon size={24} />
      </div>
    );
  }

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 6, background: "var(--cream-dark)", borderRadius: 12, padding: 4 }}>
        {(["search", "library"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setError(null); }}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: 9,
              fontWeight: 600,
              fontSize: 13,
              background: tab === t ? "#fff" : "transparent",
              color: tab === t ? "var(--espresso)" : "var(--walnut)",
              boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
              transition: "all 0.15s",
              cursor: "pointer",
            }}
          >
            {t === "search" ? "Search" : "My Library"}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 12, background: "var(--label-red)", color: "#fff", fontSize: 13, fontWeight: 500 }}>
          {error}
        </div>
      )}

      {tab === "search" && (
        <>
          <form onSubmit={(e) => { e.preventDefault(); search(); }} style={{ display: "flex", gap: 8 }}>
            <input
              type="search"
              placeholder="Search YouTube Music..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                flex: 1, padding: "10px 14px", borderRadius: 12,
                border: "2px solid var(--cream-dark)", background: "var(--warm-white)",
                fontSize: 15, color: "var(--espresso)", outline: "none", fontFamily: "inherit",
              }}
            />
            <button
              type="submit"
              disabled={searchLoading || !query.trim()}
              style={{
                padding: "10px 18px", borderRadius: 12, background: "var(--label-teal)",
                color: "#fff", fontWeight: 700, fontSize: 15,
                opacity: (searchLoading || !query.trim()) ? 0.5 : 1,
                cursor: (searchLoading || !query.trim()) ? "default" : "pointer",
              }}
            >
              {searchLoading ? <SpinnerIcon size={16} /> : "Search"}
            </button>
          </form>

          {results.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {results.map((track) => (
                <TrackRow key={track.videoId} track={track} isPlaying={playing === track.videoId} onPlay={() => play(track)} />
              ))}
            </div>
          )}

          {results.length === 0 && !searchLoading && !error && (
            <EmptyState>Search for a song, artist, or album</EmptyState>
          )}
        </>
      )}

      {tab === "library" && !authorized && (
        <div style={{ textAlign: "center", padding: 32, display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
          <div style={{ fontSize: 14, color: "var(--walnut)" }}>Connect your YouTube account to browse your playlists and liked songs.</div>
          <button
            onClick={connectYT}
            style={{ padding: "12px 24px", borderRadius: 12, background: "var(--label-teal)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
          >
            Connect YouTube Music
          </button>
        </div>
      )}

      {tab === "library" && authorized && !currentPlaylist && (
        <>
          {playlistsLoading && <div style={{ display: "flex", justifyContent: "center", padding: 24 }}><SpinnerIcon size={24} /></div>}
          {!playlistsLoading && playlists.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {playlists.map((pl) => (
                <PlaylistRow key={pl.id} playlist={pl} onOpen={() => openPlaylist(pl)} />
              ))}
            </div>
          )}
          {!playlistsLoading && playlists.length === 0 && !error && (
            <EmptyState>No playlists found</EmptyState>
          )}
        </>
      )}

      {tab === "library" && authorized && currentPlaylist && (
        <>
          <button
            onClick={() => { setCurrentPlaylist(null); setPlaylistTracks([]); setError(null); }}
            style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--label-teal)", fontWeight: 600, fontSize: 13, cursor: "pointer", padding: "4px 0", background: "none" }}
          >
            ← {currentPlaylist.title}
          </button>
          {tracksLoading && playlistTracks.length === 0 && (
            <div style={{ display: "flex", justifyContent: "center", padding: 24 }}><SpinnerIcon size={24} /></div>
          )}
          {playlistTracks.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {playlistTracks.map((track) => (
                <TrackRow key={track.videoId} track={track} isPlaying={playing === track.videoId} onPlay={() => play(track)} />
              ))}
              {playlistNextPage && (
                <button
                  onClick={() => openPlaylist(currentPlaylist, playlistNextPage)}
                  disabled={tracksLoading}
                  style={{ padding: "10px 0", borderRadius: 12, background: "var(--cream-dark)", color: "var(--espresso)", fontWeight: 600, fontSize: 13, cursor: "pointer", opacity: tracksLoading ? 0.5 : 1 }}
                >
                  {tracksLoading ? <SpinnerIcon size={16} /> : "Load more"}
                </button>
              )}
            </div>
          )}
        </>
      )}

      <div style={{
        background: "var(--warm-white)", border: "2px solid var(--cream-dark)", borderRadius: 14,
        padding: "12px 16px", textAlign: "center", fontSize: 13, color: "var(--walnut)", marginTop: "auto",
      }}>
        Will play in: <strong style={{ color: "var(--espresso)" }}>{activeRoom}</strong>
      </div>
    </div>
  );
}

function TrackRow({ track, isPlaying, onPlay }: { track: YTTrack; isPlaying: boolean; onPlay: () => void }) {
  return (
    <button
      onClick={isPlaying ? undefined : onPlay}
      style={{
        display: "flex", alignItems: "center", gap: 12, background: "var(--warm-white)",
        border: "2px solid var(--cream-dark)", borderRadius: 14, padding: 10, textAlign: "left",
        opacity: isPlaying ? 0.7 : 1, cursor: isPlaying ? "default" : "pointer",
        boxShadow: "0 2px 6px rgba(0,0,0,0.04)", transition: "opacity 0.15s",
      }}
    >
      <Thumb src={track.thumbnail} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--espresso)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
          {decodeHTML(track.title)}
        </div>
        <div style={{ fontSize: 11, color: "var(--walnut)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {decodeHTML(track.artist)}
        </div>
      </div>
      <div style={{
        width: 36, height: 36, borderRadius: "50%",
        background: isPlaying ? "var(--label-teal)" : "var(--cream-dark)",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        color: isPlaying ? "#fff" : "var(--espresso)", fontSize: 14,
      }}>
        {isPlaying ? <SpinnerIcon size={16} /> : "▶"}
      </div>
    </button>
  );
}

function PlaylistRow({ playlist, onOpen }: { playlist: YTPlaylist; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      style={{
        display: "flex", alignItems: "center", gap: 12, background: "var(--warm-white)",
        border: "2px solid var(--cream-dark)", borderRadius: 14, padding: 10, textAlign: "left",
        cursor: "pointer", boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
      }}
    >
      <Thumb src={playlist.thumbnail} size={52} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--espresso)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {playlist.title}
        </div>
        {playlist.itemCount != null && (
          <div style={{ fontSize: 11, color: "var(--walnut)", marginTop: 3 }}>
            {playlist.itemCount} songs
          </div>
        )}
      </div>
      <div style={{ color: "var(--walnut)", fontSize: 18, flexShrink: 0 }}>›</div>
    </button>
  );
}

function Thumb({ src, size = 52 }: { src?: string | null; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: 8, background: "var(--vinyl)", overflow: "hidden", flexShrink: 0 }}>
      {src ? (
        <img src={src} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 16, height: 16, borderRadius: "50%", background: "linear-gradient(135deg, var(--label-orange), var(--label-red))" }} />
        </div>
      )}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--warm-white)", border: "2px solid var(--cream-dark)", borderRadius: 14, padding: 24, textAlign: "center", color: "var(--walnut)", fontSize: 14 }}>
      {children}
    </div>
  );
}
