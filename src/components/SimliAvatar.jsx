export default function SimliAvatar({ videoRef, audioRef, persona, avatarState, size = 200, hidden = false, compact = false }) {
  if (compact) {
    return (
      <div style={{ position: "relative", width: hidden ? 0 : size, height: hidden ? 0 : size, overflow: "hidden" }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            objectFit: "cover",
            background: "var(--bg-deep)"
          }}
        />
        <audio ref={audioRef} autoPlay />
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: hidden ? 0 : size, height: hidden ? 0 : size, overflow: "hidden" }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          background: "var(--bg-deep)",
          filter: avatarState === "speaking"
            ? `drop-shadow(0 0 20px ${persona.color}60)`
            : avatarState === "listening"
            ? "drop-shadow(0 0 15px var(--success))"
            : "none",
          transition: "filter 0.3s"
        }}
      />
      <audio ref={audioRef} autoPlay />
      <div style={{
        position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
        background: avatarState === "speaking" ? persona.color
          : avatarState === "listening" ? "var(--success)"
          : avatarState === "thinking" ? "var(--warning)" : "rgba(150,150,150,0.5)",
        color: "#fff", fontSize: 11, fontWeight: 600, padding: "3px 12px",
        borderRadius: 20, whiteSpace: "nowrap", transition: "all 0.3s"
      }}>
        {avatarState === "speaking" ? "Hablando..."
          : avatarState === "listening" ? "Escuchando..."
          : avatarState === "thinking" ? "Pensando..." : "En espera"}
      </div>
    </div>
  );
}
