import { TRUSTED_LOGOS } from "@/lib/trustedLogos";

export default function TrustedByMarquee({ label }: { label?: string }) {
  return (
    <div>
      {label && (
        <p className="mb-10 text-center text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
      )}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-bg to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-bg to-transparent" />
        <div className="flex w-max animate-marquee items-center gap-16">
          {[...TRUSTED_LOGOS, ...TRUSTED_LOGOS].map((logo, i) => (
            <div
              key={`${logo.name}-${i}`}
              className="flex shrink-0 items-center gap-2.5 text-subtle opacity-60 transition hover:text-ink hover:opacity-100"
              title={logo.name}
            >
              {logo.render()}
              <span className="whitespace-nowrap text-sm font-semibold tracking-tight">{logo.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
