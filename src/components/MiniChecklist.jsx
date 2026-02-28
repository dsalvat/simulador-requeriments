import { PHASE_NAMES, PHASE_COLORS } from "../data";

export default function MiniChecklist({ items, completed }) {
  const grouped = {};
  items.forEach(i => { if (!grouped[i.fase]) grouped[i.fase] = []; grouped[i.fase].push(i); });
  const total = items.length;
  const done = completed.size;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div style={{ fontSize: 12, maxHeight: "100%", overflow: "auto" }}>
      <div style={{ fontWeight: 700, color: "#1B3A5C", marginBottom: 8, fontSize: 13 }}>
        Progrés: {done}/{total} ({pct}%)
      </div>
      <div style={{ height: 6, background: "#e8e8e8", borderRadius: 3, overflow: "hidden", marginBottom: 10 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#27AE60" : "#2E75B6", borderRadius: 3, transition: "width 0.5s" }} />
      </div>
      {Object.entries(grouped).map(([fase, faseItems]) => (
        <div key={fase} style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 11, color: PHASE_COLORS[fase], marginBottom: 2 }}>
            F{fase} {PHASE_NAMES[fase]}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {faseItems.map(item => (
              <span key={item.id} title={item.label} style={{
                display: "inline-block", padding: "1px 5px", borderRadius: 3, fontSize: 10,
                background: completed.has(item.id) ? PHASE_COLORS[fase] + "20" : "#f0f0f0",
                color: completed.has(item.id) ? PHASE_COLORS[fase] : "#bbb",
                fontWeight: completed.has(item.id) ? 600 : 400
              }}>
                {completed.has(item.id) ? "✓" : "○"} {item.id}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
