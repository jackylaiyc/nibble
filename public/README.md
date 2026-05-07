# Public assets

Files served from `/` at runtime.

## Landing page demo video — drop your file here

The landing page (`src/app/[locale]/page.tsx`) renders a `<video>` element
that looks for these files:

- **`/public/nibble-demo.mp4`** — main demo video (~60 seconds, ~1080p)
- **`/public/nibble-demo.webm`** — optional WebM fallback for smaller payload
- **`/public/nibble-demo-poster.jpg`** — still frame shown before the user hits play

If the files aren't present yet the player surface still renders, just with
no source. Once you drop them in, they're picked up automatically — no code
changes needed. Recommended specs:

| File | Format | Length | Resolution | Tips |
|---|---|---|---|---|
| nibble-demo.mp4 | H.264 + AAC | 30-90s | 1080×1920 (vertical) or 1920×1080 (landscape) | Keep file size under ~10 MB so first-paint stays snappy |
| nibble-demo.webm | VP9 + Opus | same | same | Optional — saves ~30% file size on browsers that support it |
| nibble-demo-poster.jpg | JPEG | — | match the video aspect ratio | Pick a frame that looks good even before play (e.g. the dashboard with rings) |

You can record on your phone (the app is mobile-first), export, optionally
compress with HandBrake or `ffmpeg`, and drop into this folder.
