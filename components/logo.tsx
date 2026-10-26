// The quotely mark: a rounded square holding a Q whose tail runs out diagonally, and the
// lowercase wordmark (Manrope 800, -0.055em).

export function LogoMark({ className = 'size-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" className={className} role="img" aria-label="quotely">
      <rect width="36" height="36" rx="10" fill="var(--accent)" />
      <circle cx="17" cy="17" r="7.5" fill="none" stroke="var(--accent-foreground)" strokeWidth="3.2" />
      <path d="M20.5 20.5 28 28" stroke="var(--accent-foreground)" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return <span className={`font-extrabold tracking-[-0.055em] text-fg ${className}`}>quotely</span>;
}
