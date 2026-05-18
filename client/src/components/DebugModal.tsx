import { useState, useCallback, useEffect } from "react";
import { SpinnerIcon } from "./Icons";

interface DiagRow {
  lastAt: Date | null;
  ok: boolean | null;
  detail: string;
  loading: boolean;
}

interface Props {
  onClose: () => void;
  activeRoom: string;
  sseConnected: boolean;
  lastSseEventAt: Date | null;
}

function fmtTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function mkRow(): DiagRow {
  return { lastAt: null, ok: null, detail: "", loading: false };
}

export function DebugModal({ onClose, activeRoom, sseConnected, lastSseEventAt }: Props) {
  const [rooms, setRooms] = useState<DiagRow>(mkRow());
  const [nowPlaying, setNowPlaying] = useState<DiagRow>(mkRow());
  const [queue, setQueue] = useState<DiagRow>(mkRow());
  const [ytAuth, setYtAuth] = useState<DiagRow>(mkRow());

  const runCheck = useCallback(async (
    setter: React.Dispatch<React.SetStateAction<DiagRow>>,
    url: string,
    summarize: (data: any, status: number) => string
  ) => {
    setter(p => ({ ...p, loading: true }));
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await r.json();
      setter({ lastAt: new Date(), ok: r.ok, detail: summarize(data, r.status), loading: false });
    } catch (e: any) {
      setter({ lastAt: new Date(), ok: false, detail: e?.message ?? "Failed", loading: false });
    }
  }, []);

  const checkRooms = useCallback(() => runCheck(setRooms, "/api/rooms/refresh",
    (d) => {
      const list = Array.isArray(d) ? d : (d?.zones ?? []);
      return `${list.length} room(s): ${list.map((r: any) => r.name).join(", ") || "none"}`;
    }
  ), [runCheck]);

  const checkNowPlaying = useCallback(() => runCheck(setNowPlaying, "/api/state",
    (d) => {
      const s = d?.status;
      if (!s?.title) return "Nothing playing";
      return `${s.state ?? "?"} — ${s.title}${s.artist ? ` · ${s.artist}` : ""}`;
    }
  ), [runCheck]);

  const checkQueue = useCallback(() => runCheck(setQueue,
    `/api/queue?room=${encodeURIComponent(activeRoom)}`,
    (d) => `${Array.isArray(d) ? d.length : 0} track(s) in ${activeRoom}`
  ), [runCheck, activeRoom]);

  const checkYtAuth = useCallback(() => runCheck(setYtAuth, "/api/yt/auth/status",
    (d) => d?.authorized ? "Authorized" : "Not authorized"
  ), [runCheck]);

  const checkAll = useCallback(() => {
    checkRooms();
    checkNowPlaying();
    checkQueue();
    checkYtAuth();
  }, [checkRooms, checkNowPlaying, checkQueue, checkYtAuth]);

  useEffect(() => { checkAll(); }, []);

  const diagRows = [
    { label: "Rooms", row: rooms, onRefresh: checkRooms },
    { label: "Now Playing", row: nowPlaying, onRefresh: checkNowPlaying },
    { label: "Queue", row: queue, onRefresh: checkQueue },
    { label: "YouTube Auth", row: ytAuth, onRefresh: checkYtAuth },
  ];

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div style={{
        background: "var(--cream)", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 520,
        padding: "20px 16px", paddingBottom: "calc(20px + var(--safe-bottom))",
        maxHeight: "82dvh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: "var(--espresso)" }}>Diagnostics</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={checkAll}
              style={{ padding: "7px 14px", borderRadius: 10, background: "var(--label-teal)", color: "#fff", fontWeight: 600, fontSize: 13 }}
            >
              Refresh All
            </button>
            <button
              onClick={onClose}
              style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--cream-dark)", color: "var(--walnut)", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {diagRows.map(({ label, row, onRefresh }) => (
            <DiagRowItem key={label} label={label} row={row} onRefresh={onRefresh} />
          ))}

          {/* SSE — read-only, driven by props */}
          <div style={{ background: "var(--warm-white)", border: "2px solid var(--cream-dark)", borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
            <StatusDot ok={sseConnected} loading={false} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--espresso)" }}>Live Events (SSE)</div>
              <div style={{ fontSize: 11, color: "var(--walnut)", marginTop: 2 }}>
                {sseConnected ? "Connected" : "Disconnected"}
              </div>
              <div style={{ fontSize: 10, color: "var(--sand)", marginTop: 2 }}>
                Last event {fmtTime(lastSseEventAt)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiagRowItem({ label, row, onRefresh }: { label: string; row: DiagRow; onRefresh: () => void }) {
  return (
    <div style={{ background: "var(--warm-white)", border: "2px solid var(--cream-dark)", borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
      <StatusDot ok={row.ok} loading={row.loading} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--espresso)" }}>{label}</div>
        <div style={{ fontSize: 11, color: "var(--walnut)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.loading ? "Checking…" : (row.detail || "—")}
        </div>
        <div style={{ fontSize: 10, color: "var(--sand)", marginTop: 2 }}>
          {row.lastAt ? `Last checked ${fmtTime(row.lastAt)}` : "Not yet checked"}
        </div>
      </div>
      <button
        onClick={onRefresh}
        disabled={row.loading}
        style={{ width: 32, height: 32, borderRadius: 10, background: "var(--cream-dark)", color: "var(--walnut)", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", opacity: row.loading ? 0.5 : 1 }}
      >
        {row.loading ? <SpinnerIcon size={14} /> : "↻"}
      </button>
    </div>
  );
}

function StatusDot({ ok, loading }: { ok: boolean | null; loading: boolean }) {
  if (loading) return <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--sand)", flexShrink: 0, animation: "pulse 1s ease-in-out infinite" }} />;
  if (ok === null) return <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--sand)", flexShrink: 0 }} />;
  return <div style={{ width: 10, height: 10, borderRadius: "50%", background: ok ? "#4caf50" : "var(--label-red)", flexShrink: 0 }} />;
}
