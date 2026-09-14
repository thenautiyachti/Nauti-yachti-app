# Channel art

Source for the banner, the avatar and four thumbnail layouts.

Each `.dc.html` is one artboard. `canvas.json` places them. The canvas itself
lives online — open it, edit the text in place, and export each frame as a PNG
at exactly the size YouTube wants:

| artboard | exports at | for |
|---|---|---|
| `Main` | 2560 × 1440 | channel banner |
| `Avatar` | 800 × 800 | channel picture |
| `ThumbReaction` | 1280 × 720 | the default thumbnail — words left, face right |
| `ThumbVersus` | 1280 × 720 | two things set against each other |
| `ThumbChallenge` | 1280 × 720 | one giant number or stake |
| `ThumbSeries` | 1280 × 720 | anything numbered |

**Turn the guides off before exporting.** The dashed boxes mark what gets
cropped (the banner's safe area, the avatar's circle, the corner YouTube covers
with the duration chip). They are for you, not for the upload.

**The name is his Roblox display name**, `Cake Pancake`, with a `CP` monogram.
That is deliberately the pseudonym rather than his real name, and his Roblox
*username* appears nowhere in the art.

**The palette is his character.** His avatar is crimson throughout — beanie,
hoodie, sweatpants — with a green rose and a cream shirt, so the art is red
with green and cream accents rather than a generic gaming palette. Red also
happens to be one of the three colours that carry best in a feed, so matching
him costs nothing.

## Rebuilding the canvas

`roblox-channel-art.html` is generated and not committed: it is ~2.5MB of
editor with the artboards embedded in it. Edit the `.dc.html` files, re-seed,
and republish to the same URL. The `/design` skill in Claude Code does both.

## A note on the fonts

The display face is **Bungee**, loaded from Google Fonts, with
`"Arial Black", Impact` behind it. PNG export cannot embed a Google font yet,
so **exported art shows the fallback** — which is why the fallback is a heavy
face present on both Windows and macOS rather than a generic sans. Everything
is sized so the layout holds either way, but check an export before uploading
rather than trusting the on-screen preview.
