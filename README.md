# Living Art

Image-target AR for student artwork. Scan a QR code, point the camera at a piece, and its animation plays on top of it, locked to the artwork. Runs in Safari and Chrome with no app and no accounts. Built on [MindAR](https://github.com/hiukim/mind-ar-js) 1.2.5 and three.js r160.

Live site: `https://stem-ia.github.io/living-art/`

## Pages

| Page | Who uses it | What it does |
| --- | --- | --- |
| `index.html` | Anyone | What Living Art is, demo links, artwork and video tips |
| `view.html?g=<id>` | Viewers | The AR viewer. One QR code per gallery recognizes every artwork in it. Has a no-camera preview mode |
| `view.html?g=<id>&a=<artwork id>` | Students, families | Same viewer, opened on one artwork. Printed labels carry this link. Old links with a number (`a=3`) still work |
| `piece.html` | Students | "My piece". Crop and straighten the photo, find out whether a camera can recognize it, check and fix the video, try it live, and save one hand-in file |
| `student.html` | Students | One-page printable handout with a QR code for `piece.html` |
| `build.html` | Teachers, DLC | Gallery Builder. Takes whatever students handed in, checks and fixes it, and outputs a gallery zip plus a printable poster and labels |
| `teacher.html` | Teachers | Printable guide (two pages): before, during, building, gallery day, privacy, troubleshooting |
| `test.html` | DLC | Device test kit. Shows the demo pieces on a laptop and a QR code that opens the viewer in test mode |

## How a class gallery comes together

1. **Student, before animating.** On `piece.html` the student photographs the piece, drags four corners to crop and straighten it, and sees whether a camera can recognize it. They save that image and animate on top of it.
2. **Student, after animating.** Back on `piece.html` they add the video. The page checks format, size, shape and first frame, and can convert, shrink or crop the video. They try it with their own camera, type a title, name and statement, and save `firstname-l.livingart`.
3. **Teacher.** Drop everything into `build.html`: `.livingart` files, loose photos and videos, folders, or a bulk-download zip. Fix what's flagged, try the gallery on the laptop camera, build.
4. **Publish.** The teacher sends the zip to the DLC, who runs `bash tools/add-gallery.sh <zip>`. Anyone with write access can instead drag the unzipped folder onto `github.com/stem-ia/living-art/upload/main/galleries`.
5. **Show.** Print the poster and labels from the builder.

Students who can't use `piece.html` hand in a JPG and an MP4 named `firstname-lastinitial`. The builder pairs files by folder, then by name, then by comparing each image with each video's first frame.

## What the checks do

- **Recognition test.** Compiles the artwork and runs MindAR's own detector, matcher and tracker on 12 simulated camera views (six poses, each sharp and soft). A view passes only if the artwork is recognized and placed within 6% of where it really is. 10 or more of 12 is strong, 4 to 9 is fair. The message says whether the problem is too little detail or repeating detail.
- **First frame.** Correlates the video's first frame with the artwork, so lighting differences don't count but a different picture does.
- **Shape.** Warns if the video's aspect ratio is more than 3% off the artwork's, and offers a centre crop.
- **Format and size.** Reads the codec from the file's `stsd` box, so the result doesn't depend on the browser. HEVC, ProRes and files over 15 MB are blocked until fixed; over 8 MB is a warning.

## Video fixes

`lib/convert.js` (lazy-loaded, 460 kB) re-encodes any video the browser can decode into H.264 MP4, 1280 px on the long side, 30 fps, sized to land under 6 MB, with the index at the front. AAC sound is copied as is. It bundles [Mediabunny](https://mediabunny.dev) (MPL-2.0, licence in `lib/LICENSE-mediabunny`). Source: `tools/convert.src.js`. Rebuild with `bash tools/build-convert.sh`.

HEVC can only be converted where the browser can decode it: Safari on a Mac, iPad or iPhone, and Chrome on most Macs and Windows laptops. Chromebooks usually can't, and say so.

## Privacy

What goes online for each artwork: a 1200 px JPG, the video, the title, the artist label and the statement. Nothing else.

- File names never leave the device (files are renamed `01.jpg`, `01.mp4`).
- Image EXIF, including GPS, is dropped because the image is re-encoded through a canvas.
- Video `udta` and `meta` boxes, where phones store GPS, device model and names, are renamed to `free` and **filled with zeros**. The index (`moov`) is moved to the front so playback starts before the whole file has downloaded. Picture and sound bytes are untouched. See `lib/mp4tools.js`.
- `piece.html` keeps a student's work in the browser's own storage on that device so they can come back to it. Nothing is sent anywhere.
- The viewer never uploads anything. Camera frames stay on the device.
- Galleries are public pages. Use first name and last initial, and check media consent.

## Gallery folder

```
galleries/<id>/
  gallery.json      schema 2: title, subtitle, loop, version, artworks[] (id, title, artist, statement, image, video, w, h, test)
  targets.mind      compiled MindAR targets, index = artwork order
  targets.mind.gz   same file gzipped; used when the browser supports DecompressionStream
  art/NN.jpg        artwork image, max 1200 px
  video/NN.mp4      animation
```

`version` is a build timestamp added to file URLs so phones don't show a cached old gallery. `id` on each artwork is permanent, so printed label QR codes keep working when artworks are reordered or removed.

## Hand-in file (`.livingart`)

A zip holding `piece.json` (title, artist, statement, a per-device id so a newer hand-in replaces the older one), `art.jpg`, `video.mp4` and `target.mind` (the tracking data the student's device already worked out, so the builder doesn't recompute it).

## Patches to MindAR

`lib/mindar/controller-mGt1s8dJ.js` has three fixes, all marked `Living Art patch`.

1. **Matcher stops early.** Upstream stops at the first artwork that gets a rough keyframe match, even if the pose check then fails, which blocks every artwork after it in the list. Patched to keep trying the others.
2. **Tracking kernel sized to the first artwork.** Upstream reuses one GPU kernel sized for the first tracked artwork. Mixed portrait and landscape galleries lose part of each later artwork. Patched to cache one kernel per size.
3. **Recognized frames count as seen.** Upstream only shows an artwork after six frames in which the *tracker* held it. Artwork with fine or dense detail is recognized on every frame but the tracker drops it, so it never appears. Patched so a frame counts when the artwork was tracked or freshly recognized; the pose updates from each recognition.

Measured on the same simulated camera feed, before and after patch 3:

| Feed | Before | After |
| --- | --- | --- |
| Atlas map, VGA portrait camera | found after 6.3 s, held 12% of the time | found after 0.7 s, held throughout |
| Atlas map, 720p camera, artwork filling the view | never found | found after 0.8 s, held throughout |
| Atlas map, fast hand movement | dropped 7 times in 20 s | no drops |
| Night harbour | dropped 3 times in 20 s | no drops |
| A busy image that is not in the gallery | no false match | no false match |

Position jitter is the same for recognition-driven and tracker-driven artwork (about 0.2% of the artwork's width).

## Tracking data size

Targets are compiled from a 640 px image (was 1000 px). Phone cameras stream at about 640x480, so the extra scales were never matched. Tracking data is about 25% smaller and compiles up to three times faster. The three-piece demo went from 1.17 MB to 0.90 MB gzipped.

## Viewer details

- **Sound.** Phones only let a video play with sound if `play()` was first called on that same player during a tap. The viewer keeps three players and touches all of them on every tap that matters (start, speaker). If sound is still refused, the speaker button pulses and says "Tap for sound" instead of pretending.
- **Fade-in.** The animation fades in over 0.55 s on top of the real artwork, so small differences between the print and the first frame don't show.
- **Slow find.** After nine seconds with nothing found, a tip asks the viewer to step back and avoid glare.
- **Test mode.** `view.html?g=demo&test=1` shows frame rate, camera resolution and time to find each piece, and builds a report to copy. `&res=640x480` asks the camera for a size. `&cf=`, `&beta=`, `&warm=` and `&miss=` set MindAR's smoothing and tolerance values.
- **Try before publishing.** `view.html?g=local` runs inside the builder or the student page on files that only exist on that device.

## Tools

| Script | What it does |
| --- | --- |
| `tools/add-gallery.sh <zip>` | Publish or replace one gallery from a builder zip |
| `tools/update-site.sh` | Push new page code to the live site without touching published galleries |
| `tools/build-convert.sh` | Rebuild `lib/convert.js` |

## Limits

- **Not tested on real devices yet.** Everything above was measured in desktop Chrome with a simulated camera. Safari on iPad and iPhone is the first real test. Use `test.html`.
- 25 artworks is a good class gallery size.
- GitHub Pages sites cap at 1 GB. Remove old galleries at the end of the year.
- HEIC photos open only in Safari. On other browsers the student shares the photo as a JPG.

## Licences

MindAR (MIT), three.js (MIT), JSZip (MIT), qrcode-generator (MIT), Mediabunny (MPL-2.0). Fonts: Fraunces, Outfit, JetBrains Mono (OFL). Copies are in `lib/`.
