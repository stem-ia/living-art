# Living Art roadmap

Status 2026-11-18: version 2 is built and tested in desktop Chrome with a simulated camera. Nothing has been tested on a real phone or iPad yet, and the site is not published. Each phase ends with something a teacher can use.

## Done in version 2 (2026-11-18)

Pulled forward from the old Phase 2, because they decide whether the pilot is easy:

- **Student page** (`piece.html`): crop and straighten, recognition test before animating, video checks and fixes, live try-it, one-file hand-in with title and statement.
- **Builder**: takes hand-in files, loose files, folders and zips; pairs by folder, name or picture; converts, shrinks and crops videos; fix list for students; try before publishing; build without blocked pieces.
- **Viewer**: MindAR patch 3 (recognized frames count), sound that survives moving between artworks, fade-in, artist statements, permanent label links, slow-find tip, device test mode.
- **Privacy fix**: video location data is now erased. Version 1 only hid it.
- **Teacher guide, rewritten handout, device test kit, publish scripts.**

## Phase 0: Publish and prove it on real devices

- Create `stem-ia/living-art`, run `publish-living-art.sh`, turn on GitHub Pages.
- Open `test.html` on a laptop. Test a school iPad in Safari, an iPhone, a Chromebook and an Android phone. Each one produces a report to copy.
- Check on each: all three demo pieces wake up, sound stays on from one piece to the next, the animation sits still on the artwork.
- On an iPad and a Chromebook, run `piece.html` end to end with a real drawing: photo, crop, save, add a video, try it, save the hand-in file, and submit that file to a Schoology assignment.
- Done when all four devices play all three demo pieces and one `.livingart` file has made it through Schoology into the builder.

Most likely to need a fix: sound unlock on iOS, the camera permission flow in Safari, downloading the hand-in file on iPad, and Schoology accepting the `.livingart` extension.

## Phase 1: Pilot with one class

- The teacher and I make one real piece end to end. That piece becomes the in-class demo.
- Students use the handout and the student page.
- I run the builder the first time with the teacher watching. The teacher runs it the second time alone.
- Gallery walk with the printed poster and labels. Count: pieces that didn't wake up, hand-ins that needed a fix, minutes from download to built zip.
- Done when the teacher has built a gallery without me in the room.

## Phase 2: Remove the friction the pilot shows

Likely items:

1. **Publishing without me.** A GitHub Action that accepts a builder zip, or a small upload page behind school sign-in. Decide after the pilot shows how often galleries change.
2. **HEIC photos on Chromebooks.** Today they only open in Safari.
3. **Large galleries.** Measure load time and recognition at 50 pieces on an iPad. If it drops, the builder splits a gallery into sections with one QR each.
4. **Audio statements.** An optional MP3 the student records, played with the speaker button.
5. **Gallery list on the landing page.** Only if teachers want galleries to be findable without a QR code.

## Phase 3: Make it a program

- Gallery night mode: an iPad on a stand looping the preview grid.
- A 10-minute PD slot. The pattern works for an illustrated poem (ELA), a historical figure who speaks (Social) and a science process diagram.
- Year-end routine: remove last year's galleries so the site stays under 1 GB and student work doesn't sit online indefinitely.
- Consent: confirm with the office which media consent covers a public web gallery, and add the line to the handout.

## Not planned

- Student accounts, a submission portal, or any upload from the site. No student data is collected.
- View counts or analytics.
- Native apps.

## Maintenance

- MindAR is pinned at 1.2.5 with three patches (see README). Offer them upstream as pull requests.
- three.js is pinned at r160.
- Mediabunny is bundled into `lib/convert.js`. Rebuild with `tools/build-convert.sh` to update it.
- Everything is vendored. Nothing loads from a CDN, so the site works on the school filter without exceptions.
