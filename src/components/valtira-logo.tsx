type Props = {
  className?: string;
  height?: number;
};

const ASPECT = 460 / 160;

/** Valtira horizontal logo (no tagline). Use height to scale; width is automatic from aspect ratio. */
export function ValtiraLogo({ className, height = 40 }: Props) {
  const w = Math.round(ASPECT * height);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG from public; next/image has limited SVG support
    <img
      src="/valtira-logo.svg"
      alt="Valtira"
      width={w}
      height={height}
      style={{ width: w, height, display: "block", objectFit: "contain" }}
      className={className}
      loading="eager"
      decoding="async"
    />
  );
}
