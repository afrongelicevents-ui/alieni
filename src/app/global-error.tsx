"use client";

/** Last-resort boundary (the root layout itself failed): no providers available, so it is bilingual and unstyled by design. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="nl">
      <body style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "4rem 1rem", color: "#14231b" }}>
        <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>Er ging iets mis / Something went wrong</h1>
        <p style={{ marginBottom: "1.5rem" }}>Probeer het opnieuw. / Please try again.</p>
        <button type="button" onClick={() => reset()} style={{ background: "#0B1F4B", color: "#fff", border: 0, borderRadius: 999, padding: "0.75rem 1.5rem", fontWeight: 700, cursor: "pointer" }}>
          Opnieuw proberen / Try again
        </button>
      </body>
    </html>
  );
}
