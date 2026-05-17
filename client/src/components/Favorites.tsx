interface Props {
  favorites: any[];
  activeRoom: string;
  onOpen: (index: number) => void;
}

export default function Favorites({ favorites, activeRoom, onOpen }: Props) {
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
      <section>
        <SectionLabel>Favorites</SectionLabel>
        {favorites.length === 0 && (
          <div style={{
            background: "var(--warm-white)",
            border: "2px solid var(--cream-dark)",
            borderRadius: 14,
            padding: 20,
            textAlign: "center",
            color: "var(--walnut)",
          }}>No favorites found</div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
          {favorites.map((fav: any, i: number) => (
            <FavTile
              key={i}
              name={fav.title || fav.name || `Favorite ${i + 1}`}
              art={fav.albumArt || fav.art}
              source={fav.source}
              onPlay={() => onOpen(fav.position ?? i + 1)}
            />
          ))}
        </div>
      </section>

      <div style={{
        background: "var(--warm-white)",
        border: "2px solid var(--cream-dark)",
        borderRadius: 14,
        padding: "12px 16px",
        textAlign: "center",
        fontSize: 13,
        color: "var(--walnut)",
      }}>
        Will play in: <strong style={{ color: "var(--espresso)" }}>{activeRoom}</strong>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: "var(--walnut)",
      marginBottom: 10,
      paddingLeft: 2,
    }}>{children}</div>
  );
}

function FavTile({ name, art, source, onPlay }: { name: string; art?: string; source?: string; onPlay: () => void }) {
  return (
    <button
      onClick={onPlay}
      style={{
        background: "var(--warm-white)",
        border: "2px solid var(--cream-dark)",
        borderRadius: 14,
        overflow: "hidden",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{
        width: "100%",
        aspectRatio: "1",
        background: "var(--vinyl)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        {art ? (
          <img src={art} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{
            width: "60%",
            height: "60%",
            borderRadius: "50%",
            background: "var(--vinyl-groove)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <div style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "linear-gradient(135deg, var(--label-orange), var(--label-red))",
            }} />
          </div>
        )}
      </div>
      <div style={{ padding: "10px 12px 12px" }}>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1.3,
          color: "var(--espresso)",
        }}>
          {name}
        </div>
        {source && source !== "Sonos" && (
          <div style={{
            fontSize: 10,
            fontWeight: 500,
            color: "var(--sand)",
            marginTop: 3,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}>
            {source}
          </div>
        )}
      </div>
    </button>
  );
}
