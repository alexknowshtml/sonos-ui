interface IconProps {
  size?: number;
  color?: string;
}

export function SpinnerIcon({ size = 24, color = "currentColor" }: IconProps) {
  return (
    <span className="spin">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke={color} strokeOpacity="0.25" strokeWidth="2.5" />
        <path d="M12 3a9 9 0 0 1 9 9" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function PlayIcon({ size = 24, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <polygon points="5,3 20,12 5,21" />
    </svg>
  );
}

export function PauseIcon({ size = 24, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <rect x="5" y="3" width="4.5" height="18" rx="1" />
      <rect x="14.5" y="3" width="4.5" height="18" rx="1" />
    </svg>
  );
}

export function SkipBackIcon({ size = 24, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <polygon points="19,4 9,12 19,20" />
      <rect x="4" y="4" width="3.5" height="16" rx="1" />
    </svg>
  );
}

export function SkipForwardIcon({ size = 24, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <polygon points="5,4 15,12 5,20" />
      <rect x="16.5" y="4" width="3.5" height="16" rx="1" />
    </svg>
  );
}
