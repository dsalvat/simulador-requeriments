import { GoogleLogin } from "@react-oauth/google";

export default function LoginScreen({ onGoogleLogin, authError }) {
  const errorMessages = {
    not_registered: "Tu cuenta de Google no tiene acceso a esta plataforma. Contacta con el administrador.",
    deactivated: "Tu cuenta ha sido desactivada. Contacta con el administrador.",
    network_error: "Error de conexión. Inténtalo de nuevo.",
  };

  const errorColors = {
    not_registered: { bg: "var(--warning-bg)", border: "var(--warning)", text: "var(--warning)" },
    deactivated: { bg: "var(--danger-bg)", border: "var(--danger)", text: "var(--danger)" },
    network_error: { bg: "var(--danger-bg)", border: "var(--danger)", text: "var(--danger)" },
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg-primary)", position: "relative", overflow: "hidden",
    }}>
      {/* Decorative circles */}
      <div style={{
        position: "absolute", top: -120, right: -120, width: 400, height: 400,
        borderRadius: "50%", background: "var(--accent-subtle)", opacity: 0.5,
      }} />
      <div style={{
        position: "absolute", bottom: -80, left: -80, width: 280, height: 280,
        borderRadius: "50%", background: "var(--accent-subtle)", opacity: 0.3,
      }} />

      {/* Login card */}
      <div style={{
        background: "var(--bg-surface)", borderRadius: 20, padding: "48px 40px",
        maxWidth: 420, width: "90%", boxShadow: "var(--shadow-lg)",
        animation: "fadeSlideUp 0.6s ease-out", position: "relative", zIndex: 1,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 20,
      }}>
        {/* Icon */}
        <div style={{
          width: 64, height: 64, borderRadius: 16, background: "var(--accent-subtle)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32,
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
            <line x1="9" y1="9" x2="9.01" y2="9"/>
            <line x1="15" y1="9" x2="15.01" y2="9"/>
          </svg>
        </div>

        {/* Title */}
        <div style={{ textAlign: "center" }}>
          <h1 style={{
            fontFamily: "'DM Serif Display', serif", fontSize: 32,
            color: "var(--text-primary)", fontWeight: 400, margin: 0,
          }}>
            Simulador
          </h1>
          <p style={{
            fontSize: 14, color: "var(--text-secondary)", marginTop: 8,
            maxWidth: 280, lineHeight: 1.5,
          }}>
            Practica la toma de requerimientos con personajes realistas
          </p>
        </div>

        {/* Accent bar */}
        <div style={{
          width: 48, height: 3, borderRadius: 2, background: "var(--accent)",
        }} />

        {/* Error message */}
        {authError && errorMessages[authError] && (
          <div style={{
            width: "100%", padding: "12px 16px", borderRadius: 10,
            background: errorColors[authError].bg,
            border: `1px solid ${errorColors[authError].border}20`,
            color: errorColors[authError].text,
            fontSize: 13, lineHeight: 1.5, textAlign: "center",
          }}>
            {errorMessages[authError]}
          </div>
        )}

        {/* Google Sign-In button */}
        <div style={{ marginTop: 4 }}>
          <GoogleLogin
            onSuccess={(credentialResponse) => {
              onGoogleLogin(credentialResponse.credential);
            }}
            onError={() => {
              console.error("Google login failed");
            }}
            theme="outline"
            size="large"
            width="320"
            text="continue_with"
            locale="es"
          />
        </div>

        {/* Note */}
        <p style={{
          fontSize: 12, color: "var(--text-muted)", marginTop: 4,
        }}>
          Solo usuarios autorizados
        </p>
      </div>
    </div>
  );
}
