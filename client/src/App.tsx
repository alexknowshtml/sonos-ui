import { useState, useEffect, useRef } from "react";
import { useSonos } from "./hooks/useSonos";
import NowPlaying from "./components/NowPlaying";
import Rooms from "./components/Rooms";
import YouTubeMusic from "./components/YouTubeMusic";
import Queue from "./components/Queue";
import { DebugModal } from "./components/DebugModal";
import { PlayIcon, PauseIcon, SpinnerIcon } from "./components/Icons";

type Tab = "now" | "rooms" | "yt" | "queue";

function useIsTabletLandscape() {
  const mq = "(min-width: 768px) and (orientation: landscape)";
  const [is, setIs] = useState(() => window.matchMedia(mq).matches);
  useEffect(() => {
    const m = window.matchMedia(mq);
    const h = (e: MediaQueryListEvent) => setIs(e.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);
  return is;
}

function fmtTime(sec: number | undefined): string {
  if (sec === undefined || isNaN(sec)) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const MiniPlayer = ({ s }: { s: ReturnType<typeof useSonos> }) => {
  const dur = s.nowPlaying.durationSec;
  const pos = s.livePosition ?? s.nowPlaying.positionSec;
  const hasScrubber = dur !== undefined && dur > 0;
  const pct = hasScrubber ? Math.min(100, ((pos ?? 0) / dur) * 100) : 0;

  return (
    <div style={{
      background: "var(--vinyl)",
      borderBottom: "2px solid rgba(255,255,255,0.08)",
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px" }}>
        <div style={{
          width: 40, height: 40, borderRadius: 8,
          background: "var(--vinyl-groove)", overflow: "hidden",
          flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {s.nowPlaying.albumArt ? (
            <img src={`/api/art?url=${encodeURIComponent(s.nowPlaying.albumArt)}`}
              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: 16, height: 16, borderRadius: "50%", background: "linear-gradient(135deg, var(--label-orange), var(--label-red))" }} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#FFFAF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.nowPlaying.title}
          </div>
          {hasScrubber ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 10, color: "rgba(255,250,245,0.5)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmtTime(pos)}</span>
              <div style={{ flex: 1, position: "relative", height: 3, borderRadius: 2, background: "rgba(255,250,245,0.15)", cursor: "pointer" }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const frac = (e.clientX - rect.left) / rect.width;
                  s.seek(Math.round(frac * (dur ?? 0)));
                }}
              >
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, borderRadius: 2, background: "var(--label-teal)", pointerEvents: "none" }} />
              </div>
              <span style={{ fontSize: 10, color: "rgba(255,250,245,0.5)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmtTime(dur)}</span>
            </div>
          ) : pos !== undefined ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
              <span style={{ fontSize: 10, color: "rgba(255,250,245,0.5)", fontVariantNumeric: "tabular-nums" }}>{fmtTime(pos)}</span>
              {s.nowPlaying.artist && <span style={{ fontSize: 11, color: "rgba(255,250,245,0.5)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {s.nowPlaying.artist}</span>}
            </div>
          ) : s.nowPlaying.artist ? (
            <div style={{ fontSize: 11, color: "rgba(255,250,245,0.6)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
              {s.nowPlaying.artist}
            </div>
          ) : null}
        </div>

        <button
          onClick={s.commandPending ? undefined : s.nowPlaying.state === "PLAYING" ? () => s.pause() : () => s.play()}
          style={{
            width: 40, height: 40, borderRadius: "50%",
            background: "var(--label-teal)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, boxShadow: "0 2px 8px rgba(74,155,140,0.4)",
            opacity: s.commandPending ? 0.6 : 1,
            cursor: s.commandPending ? "default" : "pointer",
          }}
        >{s.commandPending ? <SpinnerIcon size={16} /> : s.nowPlaying.state === "PLAYING" ? <PauseIcon size={16} /> : <PlayIcon size={16} />}</button>
      </div>
    </div>
  );
};

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timerRef.current);
  }, [message, onDismiss]);
  return (
    <div
      onClick={onDismiss}
      style={{
        background: "var(--label-red)",
        color: "#fff",
        padding: "10px 16px",
        fontSize: 13,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
        cursor: "pointer",
      }}
    >
      <span style={{ flex: 1 }}>⚠ {message}</span>
      <span style={{ opacity: 0.7, fontSize: 16 }}>✕</span>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("now");
  const [showDebug, setShowDebug] = useState(false);
  const s = useSonos();
  const isTabletLandscape = useIsTabletLandscape();

  // Load queue when switching to queue tab, or whenever entering landscape (always shows queue)
  useEffect(() => {
    if (tab === "queue" || isTabletLandscape) s.fetchQueue();
  }, [tab, s.activeRoom, isTabletLandscape]);

  if (s.loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cream)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 80, height: 80, borderRadius: "50%", background: "var(--vinyl)",
            margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
          }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg, var(--label-orange), var(--label-red))" }} />
          </div>
          <div style={{ color: "var(--walnut)", fontWeight: 500 }}>Connecting to Sonos...</div>
        </div>
      </div>
    );
  }

  const header = (
    <header style={{
      padding: "calc(var(--safe-top) + 12px) 16px 12px",
      background: "var(--warm-white)",
      borderBottom: "2px solid var(--cream-dark)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--vinyl)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "linear-gradient(135deg, var(--label-orange), var(--label-red))" }} />
        </div>
        <span style={{ fontWeight: 700, fontSize: 17, color: "var(--espresso)" }}>Indy Hall</span>
      </div>
      <button onClick={() => setShowDebug(true)} style={{ width: 36, height: 36, borderRadius: 10, background: "var(--cream-dark)", color: "var(--walnut)", display: "flex", alignItems: "center", justifyContent: "center" }} title="Diagnostics">
        <SlidersIcon />
      </button>
    </header>
  );

  const nowPlayingPanel = (
    <NowPlaying
      nowPlaying={s.nowPlaying}
      rooms={s.rooms}
      activeRoom={s.activeRoom}
      commandPending={s.commandPending}
      onPlay={() => s.play()}
      onPause={() => s.pause()}
      onNext={() => s.next()}
      onPrev={() => s.prev()}
      onVolume={s.setVolume}
      onOpenFavs={() => setTab("yt")}
    />
  );

  const queuePanel = (
    <Queue
      queue={s.queue}
      activeRoom={s.activeRoom}
      nowPlayingTitle={s.nowPlaying.title}
      onRefresh={() => s.fetchQueue()}
    />
  );

  if (isTabletLandscape) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
        {header}
        {s.nowPlaying.title && <MiniPlayer s={s} />}
        {s.commandError && <ErrorBanner message={s.commandError} onDismiss={s.dismissError} />}

        {/* Landscape split: Now Playing left (2/3), right panel (1/3) */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Left: Now Playing — 2/3 width */}
          <div style={{ flex: "0 0 66.67%", overflowY: "auto", WebkitOverflowScrolling: "touch", background: "var(--cream)", borderRight: "2px solid var(--cream-dark)" } as React.CSSProperties}>
            {nowPlayingPanel}
          </div>

          {/* Right: Rooms / Queue / Favorites — 1/3 width */}
          <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", background: "var(--cream)" } as React.CSSProperties}>
            {(tab === "queue" || tab === "now") && queuePanel}
            {tab === "rooms" && (
              <Rooms
                rooms={s.rooms}
                activeRoom={s.activeRoom}
                onSetRoom={s.setActiveRoom}
                onVolume={s.setVolume}
                onMute={s.setMute}
                onGroupVolume={s.setGroupVolume}
                onParty={s.party}
                onDissolve={s.dissolve}
                onJoin={s.joinGroup}
                onUnjoin={s.unjoin}
              />
            )}
            {tab === "yt" && <YouTubeMusic activeRoom={s.activeRoom} />}
          </div>
        </div>

        {/* Full-width tab bar below the split */}
        <nav style={{ display: "flex", borderTop: "2px solid var(--cream-dark)", background: "var(--warm-white)", paddingBottom: "var(--safe-bottom)", flexShrink: 0 }}>
              {([
                ["queue", "📋", "Queue"],
                ["rooms", "🔊", "Rooms"],
                ["yt", "▶️", "YouTube"],
              ] as [Tab, string, string][]).map(([id, icon, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  style={{
                    flex: 1, height: "var(--tab-h)", display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 4,
                    color: (tab === id || (id === "queue" && tab === "now")) ? "var(--label-teal)" : "var(--walnut)",
                    fontSize: 10, fontWeight: (tab === id || (id === "queue" && tab === "now")) ? 700 : 500,
                    background: "none", transition: "color 0.15s",
                  }}
                >
                  <span style={{ fontSize: 22 }}>{icon}</span>
                  <span>{label}</span>
                </button>
              ))}
        </nav>

        {showDebug && (
          <DebugModal
            onClose={() => setShowDebug(false)}
            activeRoom={s.activeRoom}
            sseConnected={s.sseConnected}
            lastSseEventAt={s.lastSseEventAt}
          />
        )}
      </div>
    );
  }

  // Portrait / phone layout
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100dvh" }}>
      {header}
      {s.nowPlaying.title && <MiniPlayer s={s} />}
      {s.commandError && <ErrorBanner message={s.commandError} onDismiss={s.dismissError} />}

      <main style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", background: "var(--cream)" } as React.CSSProperties}>
        {tab === "now" && nowPlayingPanel}
        {tab === "rooms" && (
          <Rooms
            rooms={s.rooms}
            activeRoom={s.activeRoom}
            onSetRoom={s.setActiveRoom}
            onVolume={s.setVolume}
            onMute={s.setMute}
            onGroupVolume={s.setGroupVolume}
            onParty={s.party}
            onDissolve={s.dissolve}
            onJoin={s.joinGroup}
            onUnjoin={s.unjoin}
          />
        )}
        {tab === "yt" && <YouTubeMusic activeRoom={s.activeRoom} />}
        {tab === "queue" && queuePanel}
      </main>

      <nav style={{ display: "flex", borderTop: "2px solid var(--cream-dark)", background: "var(--warm-white)", paddingBottom: "var(--safe-bottom)" }}>
        {([
          ["now", "🎵", "Now Playing"],
          ["rooms", "🔊", "Rooms"],
          ["queue", "📋", "Queue"],
          ["yt", "▶️", "YouTube"],
        ] as [Tab, string, string][]).map(([id, icon, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              flex: 1, height: "var(--tab-h)", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 4,
              color: tab === id ? "var(--label-teal)" : "var(--walnut)",
              fontSize: 10, fontWeight: tab === id ? 700 : 500,
              background: "none", transition: "color 0.15s",
            }}
          >
            <span style={{ fontSize: 22 }}>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {showDebug && (
        <DebugModal
          onClose={() => setShowDebug(false)}
          activeRoom={s.activeRoom}
          sseConnected={s.sseConnected}
          lastSseEventAt={s.lastSseEventAt}
        />
      )}
    </div>
  );
}

function SlidersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="2" y1="4.5" x2="16" y2="4.5" />
      <circle cx="11.5" cy="4.5" r="2" fill="currentColor" stroke="none" />
      <line x1="2" y1="9" x2="16" y2="9" />
      <circle cx="6.5" cy="9" r="2" fill="currentColor" stroke="none" />
      <line x1="2" y1="13.5" x2="16" y2="13.5" />
      <circle cx="12" cy="13.5" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}
