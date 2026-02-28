export default function SimliAvatar({ videoRef, audioRef, persona, avatarState, size = 200 }) {
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          background: "#1a1a2e",
          filter: avatarState === "speaking"
            ? `drop-shadow(0 0 20px ${persona.color}60)`
            : avatarState === "listening"
            ? "drop-shadow(0 0 15px #27AE6060)"
            : "none",
          transition: "filter 0.3s"
        }}
      />
      <audio ref={audioRef} autoPlay />
      <div style={{
        position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
        background: avatarState === "speaking" ? persona.color
          : avatarState === "listening" ? "#27AE60"
          : avatarState === "thinking" ? "#E67E22" : "#9995",
        color: "#fff", fontSize: 11, fontWeight: 600, padding: "3px 12px",
        borderRadius: 20, whiteSpace: "nowrap", transition: "all 0.3s"
      }}>
        {avatarState === "speaking" ? "Parlant..."
          : avatarState === "listening" ? "Escoltant..."
          : avatarState === "thinking" ? "Pensant..." : "En espera"}
      </div>
    </div>
  );
}
