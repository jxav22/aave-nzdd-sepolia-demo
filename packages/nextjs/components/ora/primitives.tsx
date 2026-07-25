import type { ReactNode } from "react";

/** Small uppercase mono label. The design's standard field/section marker. */
export const Eyebrow = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <span className={`font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground ${className}`}>
    {children}
  </span>
);

export const Card = ({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "form";
}) => <Tag className={`rounded-2xl border border-border bg-card p-6 shadow-card ${className}`}>{children}</Tag>;

export const Stat = ({
  label,
  value,
  hint,
  accent = false,
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
  className?: string;
}) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    <Eyebrow>{label}</Eyebrow>
    <div className={`tabular font-display text-3xl leading-none ${accent ? "text-[var(--clay)]" : "text-foreground"}`}>
      {value}
    </div>
    {hint ? <div className="text-xs leading-relaxed text-muted-foreground">{hint}</div> : null}
  </div>
);

export const SectionHeading = ({
  eyebrow,
  title,
  children,
  className = "",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}) => (
  <div className={className}>
    {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
    <h2 className="mt-3 font-display text-4xl leading-[1.05] lg:text-5xl">{title}</h2>
    {children ? <div className="mt-4 max-w-2xl text-muted-foreground">{children}</div> : null}
  </div>
);

type ButtonTone = "primary" | "outline" | "clay" | "ghost";

const TONE_CLASS: Record<ButtonTone, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-[var(--pine-deep)]",
  clay: "bg-[var(--clay)] text-[var(--cream)] hover:opacity-90",
  outline: "border border-input bg-background text-foreground hover:bg-secondary",
  ghost: "text-muted-foreground hover:text-foreground",
};

export const ActionButton = ({
  children,
  onClick,
  disabled = false,
  busy = false,
  tone = "primary",
  type = "button",
  full = false,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: ButtonTone;
  type?: "button" | "submit";
  full?: boolean;
  className?: string;
}) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled || busy}
    aria-busy={busy}
    className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
      TONE_CLASS[tone]
    } ${full ? "w-full" : ""} ${className}`}
  >
    {busy ? (
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
    ) : null}
    {children}
  </button>
);

export const Pill = ({
  children,
  onClick,
  active = false,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
      active
        ? "border-[var(--pine)] bg-[var(--pine)] text-[var(--cream)]"
        : "border-input text-muted-foreground hover:bg-card hover:text-foreground"
    }`}
  >
    {children}
  </button>
);

type NoteTone = "info" | "warning" | "error" | "positive";

const NOTE_CLASS: Record<NoteTone, string> = {
  info: "border-border bg-secondary/50 text-foreground",
  positive: "border-[var(--moss)]/50 bg-[var(--moss)]/15 text-foreground",
  warning: "border-[var(--clay)]/40 bg-[var(--clay)]/10 text-foreground",
  error: "border-destructive/40 bg-destructive/10 text-foreground",
};

export const Note = ({
  children,
  tone = "info",
  title,
  className = "",
}: {
  children: ReactNode;
  tone?: NoteTone;
  title?: ReactNode;
  className?: string;
}) => (
  <div className={`rounded-xl border p-4 text-sm leading-relaxed ${NOTE_CLASS[tone]} ${className}`}>
    {title ? <div className="mb-1 font-medium">{title}</div> : null}
    <div className={title ? "text-muted-foreground" : ""}>{children}</div>
  </div>
);

export const Skeleton = ({ className = "" }: { className?: string }) => (
  <span className={`inline-block animate-pulse rounded bg-border/70 align-middle ${className}`} />
);

/** A definition row: label left, monospaced value right. */
export const DataRow = ({
  label,
  value,
  hint,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: string;
}) => (
  <div className="flex items-baseline justify-between gap-4 py-2.5">
    <div className="text-sm text-muted-foreground">
      {label}
      {hint ? <div className="text-xs text-muted-foreground/70">{hint}</div> : null}
    </div>
    <div className={`tabular shrink-0 font-mono text-sm ${tone ?? "text-foreground"}`}>{value}</div>
  </div>
);
