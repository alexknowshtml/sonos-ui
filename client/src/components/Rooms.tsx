import { useState, useRef } from "react";
import type { Room } from "../hooks/useSonos";
import { useGroupVolume } from "../hooks/useGroupVolume";
import GroupVolumeCard from "./GroupVolumeCard";

interface Props {
  rooms: Room[];
  activeRoom: string;
  onSetRoom: (r: string) => void;
  onVolume: (room: string, v: number) => void;
  onMute: (room: string, state: boolean) => void;
  onGroupVolume: (groupId: string, level: number) => void;
  onParty: () => void;
  onDissolve: () => void;
  onJoin: (room: string, to: string) => void;
  onUnjoin: (room: string) => void;
  showGroupVolume?: boolean;
}

function sliderFill(val: number) {
  return `linear-gradient(to right, var(--label-teal) ${val}%, var(--cream-dark) ${val}%)`;
}

export default function Rooms({
  rooms, activeRoom, onSetRoom,
  onVolume, onMute, onGroupVolume, onParty, onDissolve, onJoin, onUnjoin,
  showGroupVolume = true,
}: Props) {
  const [dissolvePending, setDissolvePending] = useState(false);
  const dissolveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDissolve = () => {
    if (dissolvePending) {
      if (dissolveTimer.current) clearTimeout(dissolveTimer.current);
      setDissolvePending(false);
      onDissolve();
    } else {
      setDissolvePending(true);
      dissolveTimer.current = setTimeout(() => setDissolvePending(false), 3000);
    }
  };

  const { allInOneGroup, sharedGroupId, groupMaxVol } = useGroupVolume(rooms);

  const sortedRooms = [...rooms].sort((a, b) => {
    if (a.coordinator && !b.coordinator) return -1;
    if (!a.coordinator && b.coordinator) return 1;
    return a.name.localeCompare(b.name);
  });

  const coordinator = sortedRooms.find((r) => r.coordinator);
  const members = sortedRooms.filter((r) => !r.coordinator);

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Group status banner */}
      {allInOneGroup ? (
        <div style={{
          background: "var(--label-teal)",
          color: "var(--warm-white)",
          borderRadius: 14,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>🔗</span>
            <span style={{ fontWeight: 600 }}>All {rooms.length} rooms grouped</span>
          </div>
          <button
            onClick={handleDissolve}
            style={{
              background: dissolvePending ? "rgba(200,75,75,0.85)" : "rgba(255,255,255,0.2)",
              color: "var(--warm-white)",
              padding: "8px 14px",
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 600,
              transition: "background 0.15s",
            }}
          >{dissolvePending ? "Tap again to confirm" : "Dissolve"}</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10 }}>
          <ActionBtn onClick={onParty} bg="var(--label-teal)" icon="🎉">Party Mode</ActionBtn>
          <ActionBtn
            onClick={handleDissolve}
            bg={dissolvePending ? "var(--label-red)" : "var(--label-red)"}
            icon={dissolvePending ? "⚠️" : "💥"}
          >{dissolvePending ? "Tap again to confirm" : "Dissolve"}</ActionBtn>
        </div>
      )}

      {/* Group master volume — shown when all rooms are grouped and not suppressed by parent */}
      {showGroupVolume && allInOneGroup && sharedGroupId && (
        <GroupVolumeCard
          groupId={sharedGroupId}
          vol={groupMaxVol}
          onGroupVolume={onGroupVolume}
        />
      )}

      {/* Coordinator card - always first */}
      {coordinator && (
        <div>
          <SectionLabel>Coordinator</SectionLabel>
          <RoomCard
            room={coordinator}
            isCoordinator
            allInOneGroup={allInOneGroup}
            active={coordinator.name === activeRoom}
            onSelect={() => onSetRoom(coordinator.name)}
            onVolume={(v) => onVolume(coordinator.name, v)}
            onMute={(m) => onMute(coordinator.name, m)}
            onUnjoin={() => onUnjoin(coordinator.name)}
            otherCoordinators={[]}
            onJoin={(to) => onJoin(coordinator.name, to)}
          />
        </div>
      )}

      {/* Member rooms */}
      {members.length > 0 && (
        <div>
          <SectionLabel>Rooms ({members.length})</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {members.map((room) => (
              <RoomCard
                key={room.name}
                room={room}
                allInOneGroup={allInOneGroup}
                active={room.name === activeRoom}
                onSelect={() => onSetRoom(room.name)}
                onVolume={(v) => onVolume(room.name, v)}
                onMute={(m) => onMute(room.name, m)}
                onUnjoin={() => onUnjoin(room.name)}
                otherCoordinators={rooms.filter((r) => r.coordinator && r.name !== room.name)}
                onJoin={(to) => onJoin(room.name, to)}
              />
            ))}
          </div>
        </div>
      )}
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
      marginBottom: 8,
      paddingLeft: 2,
    }}>{children}</div>
  );
}

function ActionBtn({ children, onClick, bg, icon }: { children: React.ReactNode; onClick: () => void; bg: string; icon: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "14px 12px",
        borderRadius: 14,
        background: bg,
        color: "var(--warm-white)",
        fontWeight: 600,
        fontSize: 14,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      }}
    >
      <span style={{ fontSize: 18 }}>{icon}</span>
      {children}
    </button>
  );
}

function RoomCard({ room, isCoordinator, allInOneGroup, active, onSelect, onVolume, onMute, onUnjoin, otherCoordinators, onJoin }: {
  room: Room;
  isCoordinator?: boolean;
  allInOneGroup: boolean;
  active: boolean;
  onSelect: () => void;
  onVolume: (v: number) => void;
  onMute: (m: boolean) => void;
  onUnjoin: () => void;
  otherCoordinators: Room[];
  onJoin: (to: string) => void;
}) {
  const vol = room.volume ?? 30;
  const muted = room.muted ?? false;

  return (
    <div style={{
      background: "var(--warm-white)",
      borderRadius: 16,
      border: active ? "2px solid var(--label-teal)" : "2px solid var(--cream-dark)",
      padding: 16,
      boxShadow: isCoordinator ? "0 4px 12px rgba(0,0,0,0.08)" : "0 2px 6px rgba(0,0,0,0.04)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={onSelect}
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: active ? "var(--label-teal)" : "var(--cream-dark)",
              border: active ? "none" : "2px solid var(--sand)",
              flexShrink: 0,
            }}
          />
          <span style={{ fontWeight: 600, fontSize: 16, color: "var(--espresso)" }}>{room.name}</span>
          {isCoordinator && (
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.03em",
              color: "var(--label-gold)",
              background: "rgba(212, 168, 83, 0.15)",
              padding: "3px 8px",
              borderRadius: 10,
            }}>Master</span>
          )}
        </div>
        <button
          onClick={() => onMute(!muted)}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: muted ? "rgba(200, 75, 75, 0.1)" : "var(--cream-dark)",
            color: muted ? "var(--label-red)" : "var(--walnut)",
            fontSize: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >{muted ? "🔇" : "🔊"}</button>
      </div>

      {/* Volume */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{
          color: "var(--mocha)",
          fontSize: 13,
          width: 32,
          textAlign: "right",
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
        }}>{vol}%</span>
        <RoomStepBtn onClick={() => onVolume(Math.max(0, vol - 5))}>−</RoomStepBtn>
        <input
          type="range" min={0} max={100} value={vol}
          onChange={(e) => onVolume(Number(e.target.value))}
          style={{ flex: 1, background: sliderFill(vol) }}
        />
        <RoomStepBtn onClick={() => onVolume(Math.min(100, vol + 5))}>+</RoomStepBtn>
      </div>

      {/* Actions — simplified when all grouped */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <SmallBtn onClick={onUnjoin}>↩ Unjoin</SmallBtn>
        {!allInOneGroup && otherCoordinators.map((r) => (
          <SmallBtn key={r.name} onClick={() => onJoin(r.name)}>→ Join {r.name}</SmallBtn>
        ))}
      </div>
    </div>
  );
}

function SmallBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 14px",
        borderRadius: 10,
        background: "var(--cream-dark)",
        color: "var(--mocha)",
        fontSize: 12,
        fontWeight: 600,
        border: "1px solid var(--sand)",
      }}
    >{children}</button>
  );
}

function RoomStepBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 34,
        height: 34,
        borderRadius: 8,
        background: "var(--cream-dark)",
        color: "var(--espresso)",
        fontSize: 18,
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
