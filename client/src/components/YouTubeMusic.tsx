import { useState, useCallback } from "react";
import { SpinnerIcon } from "./Icons";

interface YTTrack {
  videoId: string;
  title: string;
  artist: string;
  thumbnail?: string;
}

interface Props {
  activeRoom: string;
}

function decodeHTML(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

export default function YouTubeMusic({ activeRoom }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YTTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
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
      setLoading(false);
    }
  }, [query]);

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

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <form
        onSubmit={(e) => { e.preventDefault(); search(); }}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          type="search"
          placeholder="Search YouTube Music..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: 12,
            border: "2px solid var(--cream-dark)",
            background: "var(--warm-white)",
            fontSize: 15,
            color: "var(--espresso)",
            outline: "none",
            fontFamily: "inherit",
          }}
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          style={{
            padding: "10px 18px",
            borderRadius: 12,
            background: "var(--label-teal)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 15,
            opacity: (loading || !query.trim()) ? 0.5 : 1,
            cursor: (loading || !query.trim()) ? "default" : "pointer",
          }}
        >
          {loading ? <SpinnerIcon size={16} /> : "Search"}
        </button>
      </form>

      {error && (
        <div style={{
          padding: "10px 14px",
          borderRadius: 12,
          background: "var(--label-red)",
          color: "#fff",
          fontSize: 13,
          fontWeight: 500,
        }}>
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {results.map((track) => (
            <TrackRow
              key={track.videoId}
              track={track}
              isPlaying={playing === track.videoId}
              onPlay={() => play(track)}
            />
          ))}
        </div>
      )}

      {results.length === 0 && !loading && !error && (
        <div style={{
          background: "var(--warm-white)",
          border: "2px solid var(--cream-dark)",
          borderRadius: 14,
          padding: 24,
          textAlign: "center",
          color: "var(--walnut)",
          fontSize: 14,
        }}>
          Search for a song, artist, or playlist
        </div>
      )}

      <div style={{
        background: "var(--warm-white)",
        border: "2px solid var(--cream-dark)",
        borderRadius: 14,
        padding: "12px 16px",
        textAlign: "center",
        fontSize: 13,
        color: "var(--walnut)",
        marginTop: "auto",
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
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "var(--warm-white)",
        border: "2px solid var(--cream-dark)",
        borderRadius: 14,
        padding: 10,
        textAlign: "left",
        opacity: isPlaying ? 0.7 : 1,
        cursor: isPlaying ? "default" : "pointer",
        boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
        transition: "opacity 0.15s",
      }}
    >
      <div style={{
        width: 52,
        height: 52,
        borderRadius: 8,
        background: "var(--vinyl)",
        overflow: "hidden",
        flexShrink: 0,
      }}>
        {track.thumbnail ? (
          <img src={track.thumbnail} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 16, height: 16, borderRadius: "50%", background: "linear-gradient(135deg, var(--label-orange), var(--label-red))" }} />
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--espresso)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          lineHeight: 1.3,
        }}>
          {decodeHTML(track.title)}
        </div>
        <div style={{
          fontSize: 11,
          color: "var(--walnut)",
          marginTop: 3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {decodeHTML(track.artist)}
        </div>
      </div>

      <div style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: isPlaying ? "var(--label-teal)" : "var(--cream-dark)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        color: isPlaying ? "#fff" : "var(--espresso)",
        fontSize: 14,
      }}>
        {isPlaying ? <SpinnerIcon size={16} /> : "▶"}
      </div>
    </button>
  );
}
