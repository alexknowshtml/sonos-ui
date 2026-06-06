function sliderFill(val: number) {
  return `linear-gradient(to right, var(--label-teal) ${val}%, var(--cream-dark) ${val}%)`;
}

interface Props {
  groupId: string;
  vol: number;
  label?: string;
  onGroupVolume: (groupId: string, level: number) => void;
}

export default function GroupVolumeCard({ groupId, vol, label = "Group Volume", onGroupVolume }: Props) {
  return (
    <div style={{
      background: "var(--warm-white)",
      borderRadius: 16,
      border: "2px solid rgba(74,155,140,0.25)",
      padding: 16,
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "var(--label-teal)",
        marginBottom: 12,
      }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <StepBtn onClick={() => onGroupVolume(groupId, Math.max(0, vol - 5))}>−</StepBtn>
        <input
          type="range" min={0} max={100} value={vol}
          onChange={(e) => onGroupVolume(groupId, Number(e.target.value))}
          style={{ flex: 1, background: sliderFill(vol) }}
        />
        <StepBtn onClick={() => onGroupVolume(groupId, Math.min(100, vol + 5))}>+</StepBtn>
        <span style={{
          fontSize: 13,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          color: "var(--mocha)",
          minWidth: 34,
          textAlign: "right",
        }}>{vol}%</span>
      </div>
    </div>
  );
}

function StepBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
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
