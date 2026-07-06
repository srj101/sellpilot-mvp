"use client";

export function BlobBackground() {
  return (
    <>
      <style>{`
        @keyframes blob-drift-1 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(80px, 60px); }
        }
        @keyframes blob-drift-2 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-70px, -50px); }
        }
        @keyframes blob-drift-3 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(50px, 70px); }
        }
        @keyframes blob-drift-4 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-60px, -40px); }
        }
        @keyframes blob-drift-5 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(40px, -60px); }
        }
        @keyframes blob-color-1 {
          0%, 100% { background-color: var(--primary); }
          33% { background-color: var(--accent); }
          66% { background-color: var(--ring); }
        }
        @keyframes blob-color-2 {
          0%, 100% { background-color: var(--accent); }
          33% { background-color: var(--ring); }
          66% { background-color: var(--primary); }
        }
        @keyframes blob-color-3 {
          0%, 100% { background-color: var(--ring); }
          33% { background-color: var(--primary); }
          66% { background-color: var(--accent); }
        }
      `}</style>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div
          className="absolute rounded-full blur-3xl will-change-transform"
          style={{
            width: 600,
            height: 600,
            top: "-10%",
            left: "-5%",
            opacity: 0.15,
            maskImage: "radial-gradient(circle, black 0%, transparent 70%)",
            WebkitMaskImage:
              "radial-gradient(circle, black 0%, transparent 70%)",
            animation:
              "blob-drift-1 12.8s ease-in-out infinite, blob-color-1 10s ease-in-out infinite",
          }}
        />
        <div
          className="absolute rounded-full blur-3xl will-change-transform"
          style={{
            width: 500,
            height: 500,
            top: "60%",
            right: "-5%",
            opacity: 0.12,
            maskImage: "radial-gradient(circle, black 0%, transparent 70%)",
            WebkitMaskImage:
              "radial-gradient(circle, black 0%, transparent 70%)",
            animation:
              "blob-drift-2 16s ease-in-out infinite, blob-color-2 12s ease-in-out infinite",
          }}
        />
        <div
          className="absolute rounded-full blur-3xl will-change-transform"
          style={{
            width: 450,
            height: 450,
            top: "20%",
            left: "50%",
            opacity: 0.1,
            maskImage: "radial-gradient(circle, black 0%, transparent 70%)",
            WebkitMaskImage:
              "radial-gradient(circle, black 0%, transparent 70%)",
            animation:
              "blob-drift-3 14.08s ease-in-out infinite, blob-color-3 14s ease-in-out infinite",
          }}
        />
        <div
          className="absolute rounded-full blur-3xl will-change-transform"
          style={{
            width: 550,
            height: 550,
            bottom: "-10%",
            left: "20%",
            opacity: 0.08,
            maskImage: "radial-gradient(circle, black 0%, transparent 70%)",
            WebkitMaskImage:
              "radial-gradient(circle, black 0%, transparent 70%)",
            animation:
              "blob-drift-4 17.92s ease-in-out infinite, blob-color-1 16s ease-in-out infinite",
            animationDelay: "-5s, -5s",
          }}
        />
        <div
          className="absolute rounded-full blur-3xl will-change-transform"
          style={{
            width: 400,
            height: 400,
            top: "5%",
            right: "20%",
            opacity: 0.09,
            maskImage: "radial-gradient(circle, black 0%, transparent 70%)",
            WebkitMaskImage:
              "radial-gradient(circle, black 0%, transparent 70%)",
            animation:
              "blob-drift-5 15.36s ease-in-out infinite, blob-color-2 11s ease-in-out infinite",
            animationDelay: "-3s, -3s",
          }}
        />
      </div>
    </>
  );
}
