# Design System: Living Art

## 1. Visual Theme & Atmosphere
A gallery at night. Deep ink surfaces with warm paper accents, like a label card pinned beside a framed piece. Density 5 (a tool people use, not a brochure), variance 6 (asymmetric hero, horizontal accordion, offset art stacks), motion 5 (spring-eased reveals and tactile buttons, nothing that competes with the student artwork). The artwork is always the brightest thing on screen.

## 2. Color Palette & Roles
- **Ink** (#17151d) — primary dark surface. Never pure black.
- **Ink 2** (#221f2b) — raised dark surface, accordion slices, cards on dark.
- **Ink 3** (#2e2a3a) — hover and pressed states on dark.
- **Paper** (#f3ecdb) — primary text on dark, light surface on the builder and handout.
- **Paper 2** (#e7dcc0) and **Paper 3** (#d9ccaa) — light surface steps, dividers on light.
- **Muted** (#aea593) — secondary text on dark, metadata.
- **Gold** (#dcb45f) — the single accent, 58% saturation. Primary buttons, eyebrow labels, focus rings, active sound button.
- **Status**: OK (#5f9e73), Warn (#d49a3c), Bad (#c85f4a), used only as 9 px dots and message borders, never as fills behind text.

Light pages (builder, student page, handout, teacher guide) share `lib/paper.css`: canvas #ece3cf with #faf6ec cards and Ink text. Dark pages (landing, viewer) use Ink with Paper text. One palette, no warm/cool gray drift.

## 3. Typography Rules
- **Display**: Fraunces variable (weight 560, SOFT 30). Headlines, artwork titles, captions. Tight tracking (-0.012em), hierarchy by weight and colour, sizes capped by clamp(). Hero H1 never exceeds three lines.
- **Body and UI**: Outfit variable. Buttons at 600, body at 400, 65ch max line length.
- **Mono**: JetBrains Mono 500. File sizes, link IDs, URLs, row numbers.
- All three are self-hosted in lib/fonts (OFL) so school filters cannot break them. Banned: Inter, Georgia, Palatino, system serif.

## 4. Component Stylings
- **Buttons**: pill, 48 px minimum, no outer glow. Gold on Ink pages, Ink on Paper pages. Hover brightens 6%, active translates 1 px down and scales to .985 with a spring curve. Ghost variant is a 1.5 px inset ring.
- **Icon buttons** (viewer): 48 px circles, blurred dark glass, inset ring. Active state fills Gold.
- **Cards**: 16 px radius, diffuse warm shadow (rgba(60,40,10,.07)). Used for the three builder steps only. Rows inside use a 1 px inset border instead of elevation.
- **Inputs**: label above, 10 px radius, 1.5 px border that darkens to Ink on focus. Help text below in Muted. Error text is the status line, never inline red fills.
- **Checks list**: one line per finding, 9 px colour dot, plain sentence that says what is wrong. When the page can fix it, a small Ink pill button sits on the same line ("Make it smaller", "Convert it", "Crop the video to fit"). Never ask a person to do what the page can do.
- **Row outline** (builder): red inset ring = can't be published yet, amber = works but look at it, none = ready. The summary bar counts the three.
- **Crop handles** (student page): 44 px touch targets with a 20 px Gold dot ringed in Ink, over a dimmed mask of everything outside the crop.
- **Loaders**: skeleton shimmer shaped like the thing loading (a portrait rectangle for the camera view, a title bar on the intro). No circular spinners except the 7 px in-row busy dot.
- **Empty state** (dropzone): a dashed field with one sentence, one example filename and two buttons.
- **Messages**: translucent Bad tint with a 1 px Bad border, title in bold, then one or two sentences with the fix.

## 5. Layout Principles
- Max width 1100 px on the landing page, 1040 px in the builder, 760 px on the handout, 430 px for the viewer intro card.
- Hero is a 1.15 / 0.85 split with the art stack overlapping itself, not the text. Nothing overlaps text anywhere.
- "How it works" is a horizontal accordion, not four equal cards. It collapses to stacked slices under 820 px.
- Everything collapses to one column under 820 px (builder under 720 px). No horizontal scroll at any width; main is overflow-x hidden.
- Section padding clamp(40px, 7vw, 88px). Viewer uses safe-area insets on every edge.

## 6. Motion & Interaction
- Spring curve cubic-bezier(.2, .9, .3, 1.05) on anything that moves into place.
- Reveal on scroll: 18 px rise and fade over 0.7 s, staggered 80 ms across siblings, via IntersectionObserver. CSS only, no animation library, so it loads on filtered networks.
- Preview grid tiles cascade in at 45 ms steps. Builder rows rise in when added.
- Viewer caption springs up when an artwork is found; the phone vibrates 18 ms; the scan reticle breathes on a 2.6 s loop while searching.
- The animation fades in over 0.55 s on top of the real artwork. It never pops.
- A control that needs a tap says so: the speaker button pulses with a "Tap for sound" pill when the phone has refused sound.
- Only transform and opacity are animated. prefers-reduced-motion switches everything off.

## 7. Anti-Patterns (Banned)
- No emojis in UI, code or copy.
- No Inter, no Georgia or Palatino, no system serif.
- No pure black, no neon or outer glows, no purple gradients.
- No three equal cards in a row. No "SECTION 01" style labels. No "scroll to explore".
- No centred hero on the landing page.
- No AI copy clichés (elevate, seamless, unleash, next-gen). Sentences say what the thing does.
- No placeholder names in the demo; demo pieces are original works with their own titles.
- No external CDN, font or analytics request from any page.
