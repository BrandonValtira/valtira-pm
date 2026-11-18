type Position = "top-right" | "bottom-right";

/** "disc": a bokeh circle with a defined rim. "soft": a bokeh circle with a long blurred falloff. */
type Glow = { color: string; x: string; y: string; size: string; alpha: number; disc?: "disc" | "soft" };

/** Brand purple, cyan, magenta and blue. Large soft washes plus a few bokeh discs, weighted to the right. */
const GLOWS: Glow[] = [
  { color: "104, 34, 185", x: "88%", y: "8%", size: "60vmax", alpha: 0.17 },
  { color: "11, 163, 214", x: "96%", y: "92%", size: "55vmax", alpha: 0.3 },
  { color: "206, 27, 107", x: "38%", y: "108%", size: "45vmax", alpha: 0.16 },
  { color: "46, 116, 203", x: "-4%", y: "38%", size: "42vmax", alpha: 0.16 },
  { color: "104, 34, 185", x: "72%", y: "30%", size: "17vmax", alpha: 0.1, disc: "soft" },
  { color: "11, 163, 214", x: "84%", y: "64%", size: "9vmax", alpha: 0.14, disc: "disc" },
  { color: "206, 27, 107", x: "62%", y: "82%", size: "7vmax", alpha: 0.11, disc: "disc" },
  { color: "46, 116, 203", x: "93%", y: "40%", size: "9vmax", alpha: 0.1, disc: "soft" },
  { color: "11, 163, 214", x: "18%", y: "78%", size: "8vmax", alpha: 0.1, disc: "disc" },
];

const FALLOFF = {
  wash: [0.45, 35],
  disc: [0.8, 55],
  soft: [0.5, 25],
} as const;

function glowStyle({ color, x, y, size, alpha, disc }: Glow): React.CSSProperties {
  const [midAlpha, midStop] = FALLOFF[disc ?? "wash"];
  const fill = `radial-gradient(circle, rgba(${color}, ${alpha}) 0%, rgba(${color}, ${alpha * midAlpha}) ${midStop}%, rgba(${color}, 0) 70%)`;
  return {
    left: x,
    top: y,
    width: size,
    height: size,
    transform: "translate(-50%, -50%)",
    backgroundImage: fill,
  };
}

/** Top-right: logo mark. Bottom-right: full-screen soft spectrum wash. Both fixed behind content. */
export function LogoBackground({ position = "top-right", opacity = 1 }: { position?: Position; opacity?: number }) {
  const isBottom = position === "bottom-right";
  if (isBottom) {
    return (
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" style={{ opacity }} aria-hidden>
        <div className="absolute inset-0 dark:opacity-70">
          {GLOWS.map((glow, i) => (
            <div key={i} className="absolute rounded-full" style={glowStyle(glow)} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="fixed right-0 top-0 z-0 w-[28rem]" style={{ opacity }} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo_background.svg"
        alt=""
        className="h-auto w-full object-contain object-right object-top"
        width={448}
        height={232}
      />
    </div>
  );
}
