import { useEffect, useState } from "react";

interface ViewportLoaderProps {
  visible: boolean;
}

export default function ViewportLoader({ visible }: ViewportLoaderProps) {
  const [show, setShow] = useState(visible);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (visible) {
      setShow(true);
      setFading(false);
    } else if (show) {
      // Fade out then unmount
      setFading(true);
      const timer = setTimeout(() => setShow(false), 600);
      return () => clearTimeout(timer);
    }
  }, [visible, show]);

  if (!show) return null;

  return (
    <div
      className="viewport-loader"
      style={{ opacity: fading ? 0 : 1 }}
    >
      {/* Orbiting drone lights */}
      <div className="vl-orbit">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="vl-dot"
            style={{
              "--i": i,
              "--total": 8,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Center pulse */}
      <div className="vl-core" />

      {/* Label */}
      <p className="vl-label">Restoring scene</p>
    </div>
  );
}
