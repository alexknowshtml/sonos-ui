import type { NowPlaying, Room } from "../hooks/useSonos";
import { PlayIcon, PauseIcon, SkipBackIcon, SkipForwardIcon, SpinnerIcon } from "./Icons";

interface Props {
  nowPlaying: NowPlaying;
  rooms: Room[];
  activeRoom: string;
  commandPending?: boolean;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onVolume: (room: string, v: number) => void;
  onGroupVolume: (groupId: string, v: number) => void;
  onOpenFavs: () => void;
}

export default function NowPlaying({
  nowPlaying, rooms, activeRoom, commandPending,
  onPlay, onPause, onNext, onPrev, onVolume, onGroupVolume, onOpenFavs,
}: Props) {
  const isPlaying = nowPlaying.state === "PLAYING";
  const isIdle = !nowPlaying.title && !isPlaying;
  const room = rooms.find((r) => r.name === activeRoom);

  const groupIds = new Set(rooms.map((r) => r.groupId).filter(Boolean));
  const allInOneGroup = groupIds.size === 1 && rooms.every((r) => r.groupId);
  const sharedGroupId = allInOneGroup ? rooms[0]?.groupId : undefined;
  const groupMaxVol = allInOneGroup ? Math.max(...rooms.map((r) => r.volume ?? 0)) : 0;

  const vol = allInOneGroup ? groupMaxVol : (room?.volume ?? 30);
  const handleVolume = (v: number) =>
    allInOneGroup && sharedGroupId
      ? onGroupVolume(sharedGroupId, v)
      : onVolume(activeRoom, v);

  return (
    <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Album art - vinyl record style */}
      <div style={{
        width: "min(100%, 360px)",
        aspectRatio: "1",
        borderRadius: 20,
        alignSelf: "center",
        background: "var(--vinyl)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
        position: "relative",
      }}>
        {nowPlaying.albumArt ? (
          <img src={`/api/art?url=${encodeURIComponent(nowPlaying.albumArt)}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{
            width: "70%",
            height: "70%",
            borderRadius: "50%",
            background: "var(--vinyl-groove)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "inset 0 0 20px rgba(0,0,0,0.4)",
          }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "linear-gradient(135deg, var(--label-orange), var(--label-red))",
            }} />
          </div>
        )}
      </div>

      {/* Track info card */}
      {isIdle ? (
        <div style={{
          background: "var(--warm-white)",
          borderRadius: 16,
          padding: 20,
          border: "2px solid var(--cream-dark)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          textAlign: "center",
        }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: "var(--walnut)" }}>Nothing playing</div>
          <div style={{ fontSize: 14, color: "var(--sand)" }}>Pick something from Favorites to get started</div>
          <button
            onClick={onOpenFavs}
            style={{
              padding: "10px 24px",
              borderRadius: 24,
              background: "var(--label-teal)",
              color: "var(--warm-white)",
              fontWeight: 600,
              fontSize: 14,
              boxShadow: "0 2px 8px rgba(74,155,140,0.3)",
            }}
          >Browse YouTube Music</button>
        </div>
      ) : (
        <div style={{
          background: "var(--warm-white)",
          borderRadius: 16,
          padding: 16,
          border: "2px solid var(--cream-dark)",
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--espresso)", letterSpacing: -0.3 }}>
            {nowPlaying.title}
          </div>
          <div style={{ color: "var(--walnut)", marginTop: 4, fontSize: 15 }}>
            {nowPlaying.artist || "—"}
            {nowPlaying.album ? ` · ${nowPlaying.album}` : ""}
          </div>
        </div>
      )}

      {/* Transport controls */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: "8px 0",
      }}>
        <TransportBtn onClick={onPrev} size={52} disabled={commandPending}><SkipBackIcon size={22} /></TransportBtn>
        <TransportBtn onClick={isPlaying ? onPause : onPlay} size={72} primary disabled={commandPending}>
          {commandPending ? <SpinnerIcon size={28} /> : isPlaying ? <PauseIcon size={28} /> : <PlayIcon size={28} />}
        </TransportBtn>
        <TransportBtn onClick={onNext} size={52} disabled={commandPending}><SkipForwardIcon size={22} /></TransportBtn>
      </div>

      {/* Volume card */}
      <div style={{
        background: "var(--warm-white)",
        borderRadius: 16,
        padding: 16,
        border: "2px solid var(--cream-dark)",
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--label-teal)",
          marginBottom: 10,
        }}>{allInOneGroup ? "Group Volume" : "Volume"}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StepBtn onClick={() => handleVolume(Math.max(0, vol - 5))}>−</StepBtn>
          <div style={{ flex: 1 }}>
            <input
              type="range" min={0} max={100} value={vol}
              onChange={(e) => handleVolume(Number(e.target.value))}
              style={{ background: `linear-gradient(to right, var(--label-teal) ${vol}%, var(--cream-dark) ${vol}%)` }}
            />
          </div>
          <StepBtn onClick={() => handleVolume(Math.min(100, vol + 5))}>+</StepBtn>
          <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--mocha)", minWidth: 34, textAlign: "right" }}>{vol}%</span>
        </div>
      </div>

    </div>
  );
}

function TransportBtn({ children, onClick, size, primary, disabled }: {
  children: React.ReactNode;
  onClick: () => void;
  size: number;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: primary ? "var(--label-teal)" : "var(--warm-white)",
        border: primary ? "none" : "2px solid var(--cream-dark)",
        fontSize: primary ? size * 0.38 : size * 0.4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: primary ? "0 4px 16px rgba(74, 155, 140, 0.35)" : "0 2px 6px rgba(0,0,0,0.05)",
        transition: "transform 0.1s, opacity 0.15s",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
      onPointerDown={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(0.92)"; }}
      onPointerUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >{children}</button>
  );
}

function StepBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        background: "var(--cream-dark)",
        color: "var(--espresso)",
        fontSize: 20,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        border: "1px solid var(--sand)",
      }}
    >{children}</button>
  );
}
