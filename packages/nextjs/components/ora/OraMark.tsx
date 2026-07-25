export const OraMark = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
    <circle cx="16" cy="16" r="15.25" stroke="currentColor" strokeWidth="1.25" className="text-foreground/70" />
    <path
      d="M16 6c-3.2 3.2-3.2 8.4 0 11.6M16 6c3.2 3.2 3.2 8.4 0 11.6M16 6v20"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      className="text-[var(--pine)]"
    />
    <circle cx="16" cy="21" r="2.4" fill="currentColor" className="text-[var(--clay)]" />
  </svg>
);
