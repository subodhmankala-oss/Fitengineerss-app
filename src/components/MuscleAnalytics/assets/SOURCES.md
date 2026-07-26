# Muscle diagram assets — source and license

`body-front.svg`, `body-back.svg`, and `muscle-1.svg` through `muscle-14.svg` are
vendored from the [wger](https://github.com/wger-project/wger) open-source
workout tracker (`wger/core/static/images/muscles/`), which in turn adapted
them from Wikimedia Commons files by **Termininja**:

- https://commons.wikimedia.org/wiki/File:Muscular_system-back.svg
- https://commons.wikimedia.org/wiki/File:Muscular_system.svg

**License: CC BY-SA 3.0** (Creative Commons Attribution-ShareAlike 3.0
Unported). Commercial use is allowed. Two obligations this app must keep:

1. **Attribution** must be visible somewhere in the app (see the credit line
   rendered in `MuscleHeatMap.jsx`, and duplicate it in an About/Credits
   screen if one exists).
2. **Share-alike**: if these specific image files are modified and
   redistributed (not the app's own code — just these images), the
   modified files must carry a compatible license.

Muscle-ID → name mapping (from wger's `muscles.json` fixture), and which of
this app's 11 canonical muscle groups each feeds:

| wger ID | Latin name | This app's muscle |
|---|---|---|
| 1 | Biceps brachii | Biceps |
| 2 | Anterior deltoid | Shoulders |
| 4 | Pectoralis major | Chest |
| 5 | Triceps brachii | Triceps |
| 6 | Rectus abdominis | Core |
| 7 | Gastrocnemius | Calves |
| 8 | Gluteus maximus | Glutes |
| 9 | Trapezius | Back (secondary) |
| 10 | Quadriceps femoris | Quads |
| 11 | Biceps femoris | Hamstrings |
| 12 | Latissimus dorsi | Back (primary) |
| 13 | Brachialis | Biceps (secondary) |
| 14 | Obliquus externus abdominis | Core (secondary) |

wger IDs 3 (Serratus anterior) and 15/16 (Soleus, Erector spinae) were not
vendored — their regions are close enough to Chest/Calves/Back respectively
that a dedicated overlay wasn't needed.

**Forearms** has no corresponding wger muscle file. `muscle-forearm.svg` is
therefore *generated from the body artwork itself* rather than hand-drawn:
`tools/gen-forearm-overlay.mjs` holds the arm silhouette traced by sampling
`body-front.svg`'s rendered pixels row by row, then insets it by the same
proportions the sibling biceps overlay uses against that same silhouette,
and emits a file in the identical format/style as the vendored overlays.

Measured fit of the generated result: 98% of its pixels fall inside the body
silhouette, 0% overlap the biceps overlay, and it covers ~60% of the arm in
the y=142–172 band — in line with how the vendored overlays sit on the body.
Being derived from this artwork, it is specific to it: if `body-front.svg`
is ever replaced, re-run the generator against the new art.
