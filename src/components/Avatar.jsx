export default function Avatar({ persona, state, size = 200 }) {
  const s = persona.skinColor;
  const h = persona.hairColor;
  const c = persona.shirtColor;
  const isF = persona.id === "perdut" || persona.id === "indecis";

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg viewBox="0 0 200 200" width={size} height={size} style={{
        filter: state === "speaking" ? `drop-shadow(0 0 20px ${persona.color}60)` : state === "listening" ? `drop-shadow(0 0 15px #27AE6060)` : "none",
        transition: "filter 0.3s"
      }}>
        <ellipse cx="100" cy="185" rx="55" ry="30" fill={c} opacity="0.9">
          {state === "speaking" && <animate attributeName="ry" values="30;32;30" dur="0.8s" repeatCount="indefinite" />}
        </ellipse>
        <rect x="88" y="140" width="24" height="20" rx="4" fill={s} />
        <ellipse cx="100" cy="100" rx="48" ry="52" fill={s}>
          <animate attributeName="cy" values="100;99;100;101;100" dur="3s" repeatCount="indefinite" />
        </ellipse>
        {isF ? (
          <>
            <ellipse cx="100" cy="65" rx="50" ry="30" fill={h} />
            <ellipse cx="55" cy="90" rx="12" ry="30" fill={h} />
            <ellipse cx="145" cy="90" rx="12" ry="30" fill={h} />
          </>
        ) : persona.id === "savi" ? (
          <>
            <ellipse cx="100" cy="68" rx="48" ry="22" fill={h} />
            <ellipse cx="58" cy="82" rx="10" ry="8" fill={h} />
            <ellipse cx="142" cy="82" rx="10" ry="8" fill={h} />
          </>
        ) : (
          <>
            <ellipse cx="100" cy="65" rx="48" ry="26" fill={h} />
            <rect x="52" y="65" width="12" height="20" rx="4" fill={h} />
            <rect x="136" y="65" width="12" height="20" rx="4" fill={h} />
          </>
        )}
        <g>
          {state === "listening" ? (
            <>
              <ellipse cx="80" cy="98" rx="7" ry="8" fill="white" />
              <ellipse cx="120" cy="98" rx="7" ry="8" fill="white" />
              <circle cx="81" cy="97" r="4" fill="#333">
                <animate attributeName="cy" values="97;96;97" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx="121" cy="97" r="4" fill="#333">
                <animate attributeName="cy" values="97;96;97" dur="2s" repeatCount="indefinite" />
              </circle>
            </>
          ) : state === "thinking" ? (
            <>
              <ellipse cx="80" cy="98" rx="7" ry="4" fill="white" />
              <ellipse cx="120" cy="98" rx="7" ry="4" fill="white" />
              <circle cx="82" cy="97" r="3" fill="#333" />
              <circle cx="122" cy="97" r="3" fill="#333" />
            </>
          ) : (
            <>
              <ellipse cx="80" cy="98" rx="7" ry="7" fill="white" />
              <ellipse cx="120" cy="98" rx="7" ry="7" fill="white" />
              <circle cx="80" cy="98" r="4" fill="#333">
                {state === "speaking" && <animate attributeName="cx" values="79;81;80;79" dur="1.5s" repeatCount="indefinite" />}
              </circle>
              <circle cx="120" cy="98" r="4" fill="#333">
                {state === "speaking" && <animate attributeName="cx" values="119;121;120;119" dur="1.5s" repeatCount="indefinite" />}
              </circle>
            </>
          )}
          <circle cx="80" cy="95" r="1.5" fill="white" />
          <circle cx="120" cy="95" r="1.5" fill="white" />
        </g>
        <line x1="72" y1="86" x2="88" y2={state === "listening" ? "84" : "87"} stroke={h} strokeWidth="2.5" strokeLinecap="round">
          {state === "speaking" && <animate attributeName="y2" values="87;85;87" dur="1s" repeatCount="indefinite" />}
        </line>
        <line x1="112" y1={state === "listening" ? "84" : "87"} x2="128" y2="86" stroke={h} strokeWidth="2.5" strokeLinecap="round">
          {state === "speaking" && <animate attributeName="y1" values="87;85;87" dur="1s" repeatCount="indefinite" />}
        </line>
        <path d="M97 105 Q100 112 103 105" fill="none" stroke={s} strokeWidth="2" opacity="0.5" />
        {state === "speaking" ? (
          <ellipse cx="100" cy="122" rx="10" ry="6" fill="#c0392b" opacity="0.8">
            <animate attributeName="ry" values="6;8;4;7;6" dur="0.4s" repeatCount="indefinite" />
            <animate attributeName="rx" values="10;8;12;9;10" dur="0.4s" repeatCount="indefinite" />
          </ellipse>
        ) : state === "thinking" ? (
          <line x1="90" y1="122" x2="110" y2="123" stroke="#c0392b" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
        ) : (
          <path d="M88 120 Q100 130 112 120" fill="none" stroke="#c0392b" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
        )}
        {persona.id === "savi" && (
          <g fill="none" stroke="#555" strokeWidth="2">
            <circle cx="80" cy="98" r="14" />
            <circle cx="120" cy="98" r="14" />
            <line x1="94" y1="98" x2="106" y2="98" />
          </g>
        )}
      </svg>
      <div style={{
        position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
        background: state === "speaking" ? persona.color : state === "listening" ? "#27AE60" : state === "thinking" ? "#E67E22" : "#9995",
        color: "#fff", fontSize: 11, fontWeight: 600, padding: "3px 12px",
        borderRadius: 20, whiteSpace: "nowrap", transition: "all 0.3s"
      }}>
        {state === "speaking" ? "Parlant..." : state === "listening" ? "Escoltant..." : state === "thinking" ? "Pensant..." : "En espera"}
      </div>
    </div>
  );
}
