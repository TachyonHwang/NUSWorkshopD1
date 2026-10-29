# Snip Design System

Source of truth for future styling: a quiet near-black canvas, centered Snip
headline, muted subline, oversized chat-like URL composer, and rounded utility
surfaces. Inspired by the reference's composition, not its branding or copy.
Keep the existing Angular behavior, text, and dependencies unchanged.

## Tokens

| Group | Reusable tokens |
| --- | --- |
| Canvas / surfaces | `--background: #100f11`; `--surface: #19171b`; `--surface-raised: #211e23` |
| Text | `--ink: #f7f3f1`; `--muted: #b2a9ae`; `--accent: #ffc2ae`; `--danger: #ffabae` |
| Accent | `--accent-gradient: linear-gradient(110deg, #ff917a, #f3a5bd 55%, #ffc181)`; dark text `--on-accent: #291719` |
| Hero glow | `--hero-glow: linear-gradient(110deg, rgb(255 125 96 / 16%), rgb(236 125 162 / 12%) 55%, rgb(255 165 91 / 14%))`; broad blurred band, faded vertically; no discrete blobs |
| Font | `--font-sans: 'IBM Plex Sans', 'Segoe UI', sans-serif`; `--font-mono: 'Consolas', monospace`; retain the existing font import |
| Type scale | `--text-xs: 12px`; `--text-sm: 14px`; `--text-base: 16px`; `--text-lg: 18px`; `--text-hero: 72px` (52px mobile); weights 400/500/600/700; letter spacing 0 |
| Spacing | `--space-1` through `--space-8`: 4/8/12/16/24/32/48/64px; content width 960px; desktop gutters 32px, mobile 16px |
| Radii | `--radius-input: 32px`; `--radius-card: 24px`; `--radius-notice: 16px`; `--radius-pill: 999px` |
| Borders | `--line: rgb(255 255 255 / 10%)`; 1px solid; hover border `--line-strong: rgb(255 255 255 / 20%)` |
| Elevation | `--shadow: 0 20px 60px rgb(0 0 0 / 24%)`; `--composer-shadow: 0 24px 80px rgb(0 0 0 / 32%), 0 0 48px rgb(255 145 122 / 5%)` |
| Focus | `--focus: #ffc2ae`; visible 2px outline with 4px offset; composer focus-within ring |

## Element Mapping

- **Page header / hero:** centered Snip wordmark as the bold headline; category
  above it, existing short subline below. Generous but bounded vertical spacing
  leaves the links card visible in the first viewport. No marketing additions.
- **URL form / composer:** raised surface, 32px corners, spacious borderless URL
  entry above an attached bottom-right gradient action. Keep the label accessible.
  On mobile, use a full-width attached action; retain comfortable touch targets.
- **Result:** separate 16px-radius notice with warm tinted border and a clearly
  underlined, wrapping short URL. **Errors:** rose text on a subtle rose-tinted
  notice; errors inside the links card remain inline, not another nested card.
- **Links table:** one 24px-radius card with subtle border/shadow, heading and
  restrained refresh action, raised table header, hairline row dividers, monospace
  codes and right-aligned hit counts. Wrap original URLs instead of clipping them.
- **States:** quieter disabled controls, stable action dimensions, warm focus rings;
  animate only background/border/shadow changes, never layout. No new UI behavior.