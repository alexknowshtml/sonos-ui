import { useState, useEffect } from "react";
import { useSonos } from "./hooks/useSonos";
import NowPlaying from "./components/NowPlaying";
import Rooms from "./components/Rooms";
import Favorites from "./components/Favorites";
import Queue from "./components/Queue";

type Tab = "now" | "rooms" | "favs" | "queue";

export default function App() {
  const [tab, setTab] = useState<Tab>("now");
  const s = useSonos();

  // Load queue when switching to the queue tab
  useEffect(() => {
    if (tab === "queue") s.fetchQueue();
  }, [tab, s.activeRoom]);

  if (s.loading) {
    return (
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--cream)",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: "var(--vinyl)",
            margin: "0 auto 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
          }}>
            <div style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: "linear-gradient(135deg, var(--label-orange), var(--label-red))",
            }} />
          </div>
          <div style={{ color: "var(--walnut)", fontWeight: 500 }}>Connecting to Sonos...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100dvh" }}>
      {/* Header */}
      <header style={{
        paddingTop: "calc(var(--safe-top) + 12px)",
        padding: "calc(var(--safe-top) + 12px) 16px 12px",
        background: "var(--warm-white)",
        borderBottom: "2px solid var(--cream-dark)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "var(--vinyl)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <div style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "linear-gradient(135deg, var(--label-orange), var(--label-red))",
            }} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 17, color: "var(--espresso)" }}>Indy Hall</span>
        </div>
        <button
          onClick={s.refresh}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "var(--cream-dark)",
            color: "var(--walnut)",
            fontSize: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Refresh"
        >↻</button>
      </header>

      {/* Content */}
      <main style={{
        flex: 1,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        background: "var(--cream)",
      } as React.CSSProperties}>
        {tab === "now" && (
          <NowPlaying
            nowPlaying={s.nowPlaying}
            rooms={s.rooms}
            activeRoom={s.activeRoom}
            onPlay={() => s.play()}
            onPause={() => s.pause()}
            onNext={() => s.next()}
            onPrev={() => s.prev()}
            onVolume={s.setVolume}
            onOpenFavs={() => setTab("favs")}
          />
        )}
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
        {tab === "favs" && (
          <Favorites
            favorites={s.favorites}
            activeRoom={s.activeRoom}
            onOpen={s.openFavorite}
          />
        )}
        {tab === "queue" && (
          <Queue
            queue={s.queue}
            activeRoom={s.activeRoom}
            nowPlayingTitle={s.nowPlaying.title}
            onRefresh={() => s.fetchQueue()}
          />
        )}
      </main>

      {/* Tab bar */}
      <nav style={{
        display: "flex",
        borderTop: "2px solid var(--cream-dark)",
        background: "var(--warm-white)",
        paddingBottom: "var(--safe-bottom)",
      }}>
        {([
          ["now", "🎵", "Now Playing"],
          ["rooms", "🔊", "Rooms"],
          ["queue", "📋", "Queue"],
          ["favs", "⭐", "Favorites"],
        ] as [Tab, string, string][]).map(([id, icon, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              flex: 1,
              height: "var(--tab-h)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              color: tab === id ? "var(--label-teal)" : "var(--walnut)",
              fontSize: 10,
              fontWeight: tab === id ? 700 : 500,
              background: "none",
              transition: "color 0.15s",
            }}
          >
            <span style={{ fontSize: 22 }}>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
