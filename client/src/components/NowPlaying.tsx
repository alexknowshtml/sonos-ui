import type { NowPlaying, Room } from "../hooks/useSonos";

interface Props {
  nowPlaying: NowPlaying;
  rooms: Room[];
  activeRoom: string;
  onSetRoom: (r: string) => void;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onVolume: (room: string, v: number) => void;
}

export default function NowPlaying({
  nowPlaying, rooms, activeRoom, onSetRoom,
  onPlay, onPause, onNext, onPrev, onVolume,
}: Props) {
  const isPlaying = nowPlaying.state === "PLAYING";
  const room = rooms.find((r) => r.name === activeRoom);
  const vol = room?.volume ?? 30;

  return (
    <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Album art - vinyl record style */}
      <div style={{
        width: "100%",
        aspectRatio: "1",
        borderRadius: 20,
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
      <div style={{
        background: "var(--warm-white)",
        borderRadius: 16,
        padding: 16,
        border: "2px solid var(--cream-dark)",
      }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--espresso)", letterSpacing: -0.3 }}>
          {nowPlaying.title || "Nothing playing"}
        </div>
        <div style={{ color: "var(--walnut)", marginTop: 4, fontSize: 15 }}>
          {nowPlaying.artist || "—"}
          {nowPlaying.album ? ` · ${nowPlaying.album}` : ""}
        </div>
      </div>

      {/* Transport controls */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: "8px 0",
      }}>
        <TransportBtn onClick={onPrev} size={52}>⏮</TransportBtn>
        <TransportBtn onClick={isPlaying ? onPause : onPlay} size={72} primary>
          {isPlaying ? "⏸" : "▶"}
        </TransportBtn>
        <TransportBtn onClick={onNext} size={52}>⏭</TransportBtn>
      </div>

      {/* Volume card */}
      <div style={{
        background: "var(--warm-white)",
        borderRadius: 16,
        padding: 16,
        border: "2px solid var(--cream-dark)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StepBtn onClick={() => onVolume(activeRoom, Math.max(0, vol - 5))}>−</StepBtn>
          <div style={{ flex: 1 }}>
            <input
              type="range" min={0} max={100} value={vol}
              onChange={(e) => onVolume(activeRoom, Number(e.target.value))}
              style={{ background: `linear-gradient(to right, var(--label-teal) ${vol}%, var(--cream-dark) ${vol}%)` }}
            />
          </div>
          <StepBtn onClick={() => onVolume(activeRoom, Math.min(100, vol + 5))}>+</StepBtn>
          <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--mocha)", minWidth: 34, textAlign: "right" }}>{vol}%</span>
        </div>
      </div>

      {/* Room selector */}
      <div>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--walnut)",
          marginBottom: 10,
          paddingLeft: 2,
        }}>Playing in</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {rooms.map((r) => (
            <button
              key={r.name}
              onClick={() => onSetRoom(r.name)}
              style={{
                padding: "10px 18px",
                borderRadius: 24,
                background: r.name === activeRoom ? "var(--label-teal)" : "var(--warm-white)",
                color: r.name === activeRoom ? "var(--warm-white)" : "var(--mocha)",
                fontWeight: 600,
                fontSize: 14,
                border: r.name === activeRoom ? "none" : "2px solid var(--cream-dark)",
                boxShadow: r.name === activeRoom ? "0 2px 8px rgba(74, 155, 140, 0.3)" : "none",
              }}
            >{r.name}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TransportBtn({ children, onClick, size, primary }: {
  children: React.ReactNode;
  onClick: () => void;
  size: number;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
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
        transition: "transform 0.1s",
      }}
      onPointerDown={(e) => (e.currentTarget.style.transform = "scale(0.92)")}
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
