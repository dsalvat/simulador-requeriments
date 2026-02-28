import { PHASE_NAMES, PHASE_COLORS } from "../data";

export default function MiniChecklist({ items, completed, mode = "compact" }) {
  const grouped = {};
  items.forEach(i => { if (!grouped[i.fase]) grouped[i.fase] = []; grouped[i.fase].push(i); });
  const total = items.length;
  const done = completed.size;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ fontWeight: 700, color: "var(--text-primary)", marginBottom: 8, fontSize: 13 }}>
        Progreso: {done}/{total} ({pct}%)
      </div>
      <div style={{
        height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden", marginBottom: 12
      }}>
        <div style={{
          height: "100%", width: `${pct}%`, borderRadius: 2, transition: "width 0.5s",
          background: pct === 100 ? "var(--success)" : "var(--accent)"
        }} />
      </div>
      {Object.entries(grouped).map(([fase, faseItems]) => {
        const faseDone = faseItems.filter(it => completed.has(it.id)).length;
        const fasePct = Math.round((faseDone / faseItems.length) * 100);

        return (
          <div key={fase} style={{ marginBottom: mode === "detailed" ? 12 : 8 }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4
            }}>
              <span style={{ fontWeight: 600, fontSize: 11, color: PHASE_COLORS[fase] }}>
                F{fase} {PHASE_NAMES[fase]}
              </span>
              {mode === "detailed" && (
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{faseDone}/{faseItems.length}</span>
              )}
            </div>

            {mode === "detailed" ? (
              <>
                {/* Phase progress bar */}
                <div style={{
                  height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden", marginBottom: 6
                }}>
                  <div style={{
                    height: "100%", width: `${fasePct}%`, borderRadius: 2, transition: "width 0.5s",
                    background: PHASE_COLORS[fase]
                  }} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {faseItems.map(item => (
                    <span key={item.id} title={item.label} style={{
                      display: "inline-block", padding: "2px 6px", borderRadius: 4, fontSize: 10,
                      background: completed.has(item.id) ? PHASE_COLORS[fase] + "20" : "var(--bg-secondary)",
                      color: completed.has(item.id) ? PHASE_COLORS[fase] : "var(--text-muted)",
                      fontWeight: completed.has(item.id) ? 600 : 400
                    }}>
                      {completed.has(item.id) ? "✓" : "○"} {item.id}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ display: "flex", gap: 2 }}>
                {faseItems.map(item => (
                  <div key={item.id} title={`${item.id}: ${item.label}`} style={{
                    width: 14, height: 14, borderRadius: 3, fontSize: 8, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: completed.has(item.id) ? PHASE_COLORS[fase] : "var(--bg-secondary)",
                    color: completed.has(item.id) ? "#fff" : "var(--text-muted)",
                    transition: "all 0.3s"
                  }}>
                    {completed.has(item.id) ? "✓" : ""}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
