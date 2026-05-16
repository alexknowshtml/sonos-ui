import type { QueueTrack } from "../hooks/useSonos";

interface Props {
  queue: QueueTrack[];
  activeRoom: string;
  nowPlayingTitle?: string;
  onRefresh: () => void;
}

function artUrl(url?: string) {
  if (!url) return null;
  return `/api/art?url=${encodeURIComponent(url)}`;
}

export default function Queue({ queue, activeRoom, nowPlayingTitle, onRefresh }: Props) {
  if (queue.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🎵</div>
        <div style={{ color: "var(--walnut)", fontWeight: 500 }}>Queue is empty</div>
        <div style={{ color: "var(--mocha)", fontSize: 13, marginTop: 6 }}>in {activeRoom}</div>
        <button
          onClick={onRefresh}
          style={{
            marginTop: 16,
            padding: "10px 20px",
            borderRadius: 20,
            background: "var(--cream-dark)",
            color: "var(--mocha)",
            fontWeight: 600,
            fontSize: 13,
            border: "1px solid var(--sand)",
          }}
        >Refresh</button>
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--walnut)",
        }}>{queue.length} tracks · {activeRoom}</div>
        <button
          onClick={onRefresh}
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: "var(--cream-dark)",
            color: "var(--walnut)",
            fontSize: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--sand)",
          }}
        >↻</button>
      </div>

      {queue.map((track, i) => {
        const isActive = track.title && track.title === nowPlayingTitle;
        const art = artUrl(track.albumArt);
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              borderRadius: 12,
              background: isActive ? "rgba(74,155,140,0.1)" : "var(--warm-white)",
              border: isActive ? "1.5px solid rgba(74,155,140,0.3)" : "1.5px solid transparent",
            }}
          >
            {/* Album art thumbnail */}
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              background: "var(--vinyl)",
              flexShrink: 0,
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              {art ? (
                <img src={art} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "var(--vinyl-groove)",
                }} />
              )}
            </div>

            {/* Track info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight: isActive ? 700 : 500,
                fontSize: 14,
                color: isActive ? "var(--label-teal)" : "var(--espresso)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>{track.title || "Unknown"}</div>
              <div style={{
                fontSize: 12,
                color: "var(--walnut)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {track.artist || "—"}
                {track.album ? ` · ${track.album}` : ""}
              </div>
            </div>

            {/* Playing indicator */}
            {isActive && (
              <div style={{
                fontSize: 16,
                flexShrink: 0,
                color: "var(--label-teal)",
              }}>▶</div>
            )}

            {/* Track number */}
            {!isActive && (
              <div style={{
                fontSize: 12,
                color: "var(--sand)",
                flexShrink: 0,
                fontVariantNumeric: "tabular-nums",
                minWidth: 20,
                textAlign: "right",
              }}>{i + 1}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
