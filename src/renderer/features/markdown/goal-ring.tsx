const RADIUS = 4;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function GoalRing({ progress }: { progress: number }) {
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden="true" className="shrink-0">
      <circle
        cx="5"
        cy="5"
        r={RADIUS}
        fill="none"
        strokeWidth="1.5"
        className="stroke-foreground/15"
      />
      <circle
        cx="5"
        cy="5"
        r={RADIUS}
        fill="none"
        strokeWidth="1.5"
        className="stroke-current"
        strokeDasharray={`${clamped * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
        transform="rotate(-90 5 5)"
      />
    </svg>
  );
}
