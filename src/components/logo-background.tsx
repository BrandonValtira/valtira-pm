type Position = "top-right" | "bottom-right";

/** Top-right: logo mark. Bottom-right: abstract corner background. Both behind content. */
export function LogoBackground({ position = "top-right" }: { position?: Position }) {
  const isBottom = position === "bottom-right";
  if (isBottom) {
    return (
      <div
        className="fixed bottom-0 right-0 z-0 h-[min(100vh,280px)] w-[min(100vw,420px)] overflow-hidden opacity-100"
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/corner-background.png"
          alt=""
          className="h-full w-full object-cover object-left object-bottom"
          width={420}
          height={280}
        />
      </div>
    );
  }
  return (
    <div className="fixed right-0 top-0 z-0 w-[28rem] opacity-100" aria-hidden>
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
