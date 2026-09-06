/** The mark: two takes on the baseline, one lifted out — the promote gesture. */
export function Mark() {
  return (
    <svg viewBox="0 0 48 64" aria-hidden="true">
      <rect x="0" y="28" width="10" height="20" fill="var(--cyan)" />
      <rect x="14.5" y="28.5" width="19" height="19" fill="none" stroke="var(--cyan)" stroke-width="1" stroke-dasharray="2 2" opacity=".5" />
      <rect x="14" y="16" width="20" height="20" fill="var(--coral)" />
      <rect x="38" y="28" width="10" height="20" fill="var(--cyan)" />
    </svg>
  );
}

export function Logo() {
  return (
    <a class="brand" href="/" onClick={(e) => e.preventDefault()}>
      <Mark />
      takekeeper
    </a>
  );
}
