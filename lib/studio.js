// Living Art studio: everything the Gallery Builder (build.html) and the student page (check.html) share.
// Reading files, the checks, the tracking test, video fixes, and the one-file hand-in package.
// Nothing here uploads anything. All of it runs in the browser.

import { Compiler, Controller } from './mindar/mindar-image.prod.js';
import { inspect, videoCodec, clean } from './mp4tools.js';

export const SPEC = {
  IMG_MAX: 1200,        // longest side of the published artwork image
  COMPILE_MAX: 640,     // longest side used for tracking data. Phone cameras stream at about 640x480, so more is wasted
  VID_GOOD_MB: 8,       // under this loads quickly on school Wi-Fi
  VID_MAX_MB: 15,       // over this is blocked until it is shrunk
  VID_MAX_SIDE: 1280,
  VID_LONG_S: 30,
  STATEMENT_MAX: 400,
  PKG_EXT: 'livingart',
};
const log = (...a) => console.log('[LAS]', ...a);

// ---------------------------------------------------------------- names
export const ext = (f) => ((f.name || '').split('.').pop() || '').toLowerCase();
export const isImg = (f) => !!f && ((f.type || '').startsWith('image/') || /^(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/.test(ext(f)));
export const isVid = (f) => !!f && ((f.type || '').startsWith('video/') || /^(mp4|m4v|mov|webm|mkv)$/.test(ext(f)));
export const isPkg = (f) => !!f && ext(f) === SPEC.PKG_EXT;
export const isZip = (f) => !!f && (ext(f) === 'zip' || f.type === 'application/zip' || f.type === 'application/x-zip-compressed');
export const stem = (n) => n.replace(/\.[^.]+$/, '').toLowerCase().replace(/[\s_]+/g, '-').replace(/-(image|img|still|art|artwork|photo|picture|pic|video|vid|animation|anim|final|export)$/, '').replace(/^-+|-+$/g, '');
export const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
export const shortId = () => { const a = new Uint8Array(4); crypto.getRandomValues(a); return [...a].map((b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join(''); };

const CAMERA_NAME = /^(img|vid|pxl|dsc|dscn|mvi|mov|video|image|photo|picture|screen-?recording|screenshot|untitled|export|final|movie|clip|capture|trim|rpreplay|copy-of|[0-9a-f]{8}-[0-9a-f]{4})([-0-9]|$)|^[\d-]+$/;
// "maya-w" -> "Maya W."   "Wood, Maya" -> "Maya W."   "IMG_2231" -> ""
export function artistFromName(raw) {
  if (!raw) return '';
  let s = raw.replace(/\.[^.]+$/, '').trim();
  const comma = s.match(/^([^,]+),\s*([^-–(]+)/); // "Last, First - anything"
  if (comma) return tidyName(`${comma[2].trim().split(/\s+/)[0]} ${comma[1].trim()[0]}`);
  s = stem(s);
  if (!s || CAMERA_NAME.test(s)) return '';
  const parts = s.split('-').filter(Boolean);
  if (parts.length > 3 || parts.some((p) => /\d{3,}/.test(p))) return '';
  return tidyName(parts.join(' '));
}
function tidyName(s) {
  const parts = s.split(/\s+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase());
  if (parts.length > 1 && parts[parts.length - 1].length === 1) parts[parts.length - 1] += '.';
  return parts.join(' ');
}

// ---------------------------------------------------------------- image
export function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('image')); im.src = src; });
}
export function scaledCanvas(img, w, h, max) {
  const s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
  x.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
export const canvasBlob = (canvas, q = 0.88) => new Promise((r) => canvas.toBlob(r, 'image/jpeg', q));
// Re-encoding through a canvas drops EXIF, including GPS.
export const artJpeg = (img, w, h) => canvasBlob(scaledCanvas(img, w, h, SPEC.IMG_MAX));

// -> { ok, el, w, h, url, checks }
export async function readImage(file) {
  const url = URL.createObjectURL(file);
  const out = { ok: false, el: null, w: 0, h: 0, url, checks: [] };
  try { out.el = await loadImage(url); }
  catch {
    const e = ext(file);
    out.checks.push({ level: 'bad', code: 'img-open', text: e === 'heic' || e === 'heif'
      ? 'This is an iPhone HEIC photo, which this browser can\'t open. Open this page in Safari on the iPhone or iPad, or share the photo to Files or Mail to get a JPG.'
      : 'This image can\'t be opened. Save it as JPG or PNG.' });
    URL.revokeObjectURL(url); out.url = '';
    return out;
  }
  out.ok = true; out.w = out.el.naturalWidth; out.h = out.el.naturalHeight;
  const short = Math.min(out.w, out.h);
  if (short < 500) out.checks.push({ level: 'warn', code: 'img-small', text: `Small image (${out.w}×${out.h}). Photograph or scan it so the short side is at least 1000 px.` });
  const r = out.w / out.h;
  if (r > 2.6 || r < 1 / 2.6) out.checks.push({ level: 'warn', code: 'img-long', text: 'Very long, thin artwork is hard for the camera to hold. It works best between square and about 2:1.' });
  return out;
}

// ---------------------------------------------------------------- video
// -> { ok, url, w, h, dur, codec, cleanBlob, el, checks, fix }   fix is null | 'format' | 'size'
export async function readVideo(file) {
  const url = URL.createObjectURL(file);
  const out = { ok: false, url, w: 0, h: 0, dur: 0, codec: null, cleanBlob: null, el: null, checks: [], fix: null, mb: file.size / 1048576 };
  const e = ext(file), mb = out.mb;
  if (['mp4', 'm4v', 'mov'].includes(e) || /mp4|quicktime/.test(file.type || '')) {
    if (file.size < 300 * 1048576) {
      try {
        const buf = await file.arrayBuffer();
        const info = inspect(buf);
        if (info.isMp4) {
          out.codec = videoCodec(info);
          const c = clean(buf, info);
          out.cleanBlob = c.blob;
          if (info.hasLocation) out.checks.push({ level: 'info', code: 'vid-gps', text: 'Phone location data was inside this video. It has been erased.' });
        }
      } catch (err) { log('inspect failed', err); }
    }
  }
  if (out.codec === 'hevc') {
    out.fix = 'format';
    out.checks.push({ level: 'bad', code: 'vid-hevc', text: 'This video is HEVC (the iPhone "High Efficiency" format). Chromebooks and most Android phones can\'t play it.' });
  } else if (out.codec === 'prores') {
    out.fix = 'format';
    out.checks.push({ level: 'bad', code: 'vid-prores', text: 'This video is ProRes, an editing format that phones can\'t play.' });
  } else if (e === 'webm' || e === 'mkv') {
    out.fix = 'format';
    out.checks.push({ level: 'warn', code: 'vid-webm', text: 'This video format doesn\'t play on older iPads. MP4 is safer.' });
  }
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  try {
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('decode')); setTimeout(() => rej(new Error('timeout')), 15000); });
  } catch {
    if (!out.checks.some((c) => c.level === 'bad')) { out.fix = out.fix || 'format'; out.checks.push({ level: 'bad', code: 'vid-play', text: 'This video won\'t play in this browser.' }); }
    out.playable = false;
    return out; // url kept so the caller can still show the file name; no dimensions
  }
  out.ok = true; out.playable = true; out.el = v; out.w = v.videoWidth; out.h = v.videoHeight; out.dur = v.duration;
  if (mb > SPEC.VID_MAX_MB) { out.fix = out.fix || 'size'; out.checks.push({ level: 'bad', code: 'vid-huge', text: `Large video (${mb.toFixed(1)} MB). It would be slow on school Wi-Fi.` }); }
  else if (mb > SPEC.VID_GOOD_MB) { out.fix = out.fix || 'size'; out.checks.push({ level: 'warn', code: 'vid-big', text: `Video is ${mb.toFixed(1)} MB. Under ${SPEC.VID_GOOD_MB} MB loads faster.` }); }
  if (v.duration > SPEC.VID_LONG_S) out.checks.push({ level: 'warn', code: 'vid-long', text: `Video is ${Math.round(v.duration)} s long. Viewers usually watch 5 to 15 s.` });
  if (v.duration && v.duration < 2) out.checks.push({ level: 'warn', code: 'vid-short', text: 'Video is under 2 seconds. Aim for 5 to 15 s.' });
  return out;
}

// Turn a video into a small H.264 MP4. opts: { aspect, onProgress }. Throws an Error with a friendly .message.
export async function fixVideo(file, opts = {}) {
  let mod;
  try { mod = await import('./convert.js'); }
  catch { throw new Error('The converter didn\'t load. Check the connection and try again.'); }
  try {
    const r = await mod.convert(file, { maxSide: SPEC.VID_MAX_SIDE, maxMB: 6, fps: 30, aspect: opts.aspect || 0, onProgress: opts.onProgress });
    log('fixed', file.name, JSON.stringify({ mb: +(r.file.size / 1048576).toFixed(2), w: r.width, h: r.height, kbps: Math.round(r.bitrate / 1000), audioDropped: r.audioDropped, cropped: r.cropped }));
    return r;
  } catch (e) {
    log('fix failed', e && e.message);
    const m = String(e && e.message || e);
    if (/cannot-decode|undecodable|unknown_source_codec/.test(m)) throw new Error('This device can\'t read that video format. Try it on a Mac, iPad or iPhone (Safari can read HEVC), or export the video again as MP4 (H.264).');
    if (/no_encodable|encod/i.test(m)) throw new Error('This browser can\'t write MP4 video. Use a current Chrome, Edge or Safari.');
    throw new Error('The video couldn\'t be converted. Export it again as MP4 (H.264) at 720p.');
  }
}

// ---------------------------------------------------------------- does the video start on the artwork?
function lumaGrid(src, w, h, gw, gh) {
  const mid = document.createElement('canvas'); mid.width = gw * 4; mid.height = gh * 4;
  const mx = mid.getContext('2d'); mx.imageSmoothingQuality = 'high';
  mx.drawImage(src, 0, 0, w, h, 0, 0, mid.width, mid.height);
  const c = document.createElement('canvas'); c.width = gw; c.height = gh;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'high'; x.filter = 'blur(1px)';
  x.drawImage(mid, 0, 0, gw, gh);
  const d = x.getImageData(0, 0, gw, gh).data, out = new Float32Array(gw * gh);
  for (let i = 0; i < out.length; i++) out[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  return out;
}
function correlate(a, b) {
  let ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; }
  ma /= a.length; mb /= b.length;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < a.length; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
  return sab / Math.sqrt(saa * sbb || 1);
}
async function firstFrame(v) {
  if (v.currentTime > 0.001) { await new Promise((r) => { v.onseeked = r; v.currentTime = 0; setTimeout(r, 3000); }); }
}
// A small signature of a picture, used to compare an artwork with a video's first frame.
export function signature(src, w, h) { return lumaGrid(src, w, h, 24, 24); }
export async function videoSignature(vid) { await firstFrame(vid.el); return lumaGrid(vid.el, vid.w, vid.h, 24, 24); }
export const similarity = correlate;

// img: {el,w,h}  vid: {el,w,h}  -> { corr, shapeOff, checks }
export async function matchCheck(img, vid) {
  const out = { corr: 0, shapeOff: false, checks: [] };
  const ia = img.w / img.h, va = vid.w / vid.h;
  if (Math.abs(va - ia) / ia > 0.03) {
    out.shapeOff = true;
    out.checks.push({ level: 'warn', code: 'shape', text: `The video's shape (${vid.w}×${vid.h}) doesn't match the artwork (${img.w}×${img.h}), so it would look stretched.` });
  }
  await firstFrame(vid.el);
  const gw = 32, gh = Math.max(8, Math.round(32 / ia));
  out.corr = correlate(lumaGrid(img.el, img.w, img.h, gw, gh), lumaGrid(vid.el, vid.w, vid.h, gw, gh));
  if (out.corr >= 0.9) out.checks.push({ level: 'ok', code: 'match', text: 'The video starts on the finished artwork, so it will come alive smoothly.' });
  else if (out.corr >= 0.7) out.checks.push({ level: 'warn', code: 'match-close', text: 'The first frame is close to the artwork but not exact. Check the crop, and that the video starts on the finished piece.' });
  else out.checks.push({ level: 'warn', code: 'match-off', text: 'The first frame looks different from the artwork, so the video will pop in on top of it. Start the animation on the finished artwork.' });
  return out;
}

// ---------------------------------------------------------------- tracking targets and the tracking test
const TEST_VIEWS = [
  { s: 0.85, rot: 0, skew: 0, dx: 0 }, { s: 0.8, rot: 0.14, skew: 0.12, dx: 20 },
  { s: 0.55, rot: -0.1, skew: -0.12, dx: -60 }, { s: 0.55, rot: 0.22, skew: 0.06, dx: 70 },
  { s: 0.4, rot: 0.06, skew: 0.1, dx: 40 }, { s: 0.4, rot: -0.16, skew: -0.08, dx: -50 },
];
let testCtrl = null, wallCanvas = null, chain = Promise.resolve();
function wall() {
  if (wallCanvas) return wallCanvas;
  const c = document.createElement('canvas'); c.width = 80; c.height = 60;
  const x = c.getContext('2d'), d = x.createImageData(80, 60);
  for (let i = 0; i < d.data.length; i += 4) { const v = 168 + Math.random() * 14; d.data[i] = v; d.data[i + 1] = v - 3; d.data[i + 2] = v - 10; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0);
  return (wallCanvas = c);
}
function featureScore(entry) {
  let n = 0;
  for (const k of entry.matchingData) n += k.maximaPoints.length + k.minimaPoints.length;
  return n;
}
export function exportTargets(list) {
  const c = new Compiler();
  c.data = list.map((t) => ({ targetImage: { width: t.width, height: t.height }, matchingData: t.matchingData, trackingData: t.trackingData }));
  return c.exportData();
}
export function importTargets(buf) {
  return new Compiler().importData(buf).map((e) => ({ matchingData: e.matchingData, trackingData: e.trackingData, width: e.targetImage.width, height: e.targetImage.height, score: featureScore(e) }));
}
// Runs MindAR's own detector, matcher and tracker on simulated camera views of the artwork:
// six poses (near, mid, far, tilted), each as a sharp camera and as a soft one. The result is one letter per view:
//   T recognised in the right place and tracked   f recognised in the right place   x recognised in the wrong place   - not recognised
// With Living Art's MindAR patch 3 the viewer shows an artwork whenever it is recognised, so T and f both count.
export async function selfTest(img, w, h, target) {
  if (!testCtrl) testCtrl = new Controller({ inputWidth: 640, inputHeight: 480, maxTrack: 1 });
  testCtrl.addImageTargetsFromBuffer(exportTargets([target]));
  const K = testCtrl.projectionTransform;
  const c = document.createElement('canvas'); c.width = 640; c.height = 480;
  const x = c.getContext('2d', { willReadFrequently: true });
  const src = scaledCanvas(img, w, h, 900);
  let out = '';
  for (const blur of [0.7, 1.4]) for (const v of TEST_VIEWS) {
    x.setTransform(1, 0, 0, 1, 0, 0); x.filter = 'none';
    x.drawImage(wall(), 0, 0, 640, 480);
    const k = Math.min(v.s * 480 / h, v.s * 640 / w);
    x.translate(320 + v.dx, 240); x.rotate(v.rot); x.transform(1, 0, v.skew, 1, 0, 0);
    const T = x.getTransform();
    x.filter = `blur(${blur}px) brightness(0.9) contrast(0.9)`;
    x.drawImage(src, -w * k / 2, -h * k / 2, w * k, h * k);
    const { featurePoints } = await testCtrl.detect(c);
    const { modelViewTransform: m } = await testCtrl.match(featurePoints, 0);
    if (!m) { out += '-'; continue; }
    // where did the match put the artwork's corners, compared with where they really are?
    let worst = 0, span = 1;
    const truth = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([a, b]) => T.transformPoint(new DOMPoint((a - 0.5) * w * k, (b - 0.5) * h * k)));
    span = Math.hypot(truth[1].x - truth[0].x, truth[1].y - truth[0].y);
    [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([a, b], i) => {
      const X = a * target.width, Y = b * target.height;
      const cx = m[0][0] * X + m[0][1] * Y + m[0][3], cy = m[1][0] * X + m[1][1] * Y + m[1][3], cz = m[2][0] * X + m[2][1] * Y + m[2][3];
      const u = (K[0][0] * cx + K[0][1] * cy + K[0][2] * cz) / cz, vv = (K[1][1] * cy + K[1][2] * cz) / cz;
      worst = Math.max(worst, Math.hypot(u - truth[i].x, vv - truth[i].y));
    });
    if (worst / span > 0.06) { out += 'x'; continue; }
    let cur = m, held = 0;
    for (let i = 0; i < 2 && cur; i++) { cur = await testCtrl.trackUpdate(cur, await testCtrl.track(c, cur, 0)); if (cur) held++; }
    out += held === 2 ? 'T' : 'f';
  }
  return out;
}
// Compiles one artwork and tests it. Calls are queued so only one runs at a time. `alive()` lets the caller cancel a stale job.
export function compileTarget(img, w, h, alive = () => true) {
  const job = chain.then(async () => {
    if (!alive()) return null;
    const t0 = performance.now();
    const canvas = scaledCanvas(img, w, h, SPEC.COMPILE_MAX);
    const [entry] = await new Compiler().compileImageTargets([canvas], () => {});
    const target = { matchingData: entry.matchingData, trackingData: entry.trackingData, width: canvas.width, height: canvas.height, score: featureScore(entry) };
    target.test = await selfTest(img, w, h, target);
    log('compiled', JSON.stringify({ px: `${canvas.width}x${canvas.height}`, score: target.score, ms: Math.round(performance.now() - t0), test: target.test }));
    return target;
  });
  chain = job.catch(() => {});
  return job;
}
// 'strong' | 'fair' | 'weak' | 'none' | 'untested'
const seenIn = (test) => [...test].filter((c) => c === 'T' || c === 'f').length;
export function trackingGrade(test) {
  if (!test) return 'untested';
  const n = seenIn(test), of = test.length;
  if (n >= of * 0.8) return 'strong';
  if (n >= of * 0.3) return 'fair';
  return n > 0 ? 'weak' : 'none';
}
// target: { test, score }. score is the number of detail points the camera found in the artwork.
export function trackingCheck(target, forStudent = false) {
  const test = target && target.test, g = trackingGrade(test), n = test ? seenIn(test) : 0, of = test ? test.length : 0;
  const plain = target && target.score < 400, wrongPlace = !!test && test.includes('x');
  const more = forStudent
    ? ' Add outlines, texture, lettering or a detailed background. Bold, different shapes all over the page work best. Then retake the photo in even light with no glare.'
    : ' Bolder, more varied detail helps.';
  if (g === 'strong') return { level: 'ok', code: 'track-strong', text: `The camera recognizes this artwork: ${n} of ${of} test views.` };
  if (g === 'fair') return { level: 'warn', code: 'track-fair', text: `The camera recognizes this only some of the time (${n} of ${of} test views), so it may be slow to come alive.${more}` };
  if (g === 'untested') return { level: 'warn', code: 'track-untested', text: 'Tracking not tested yet.' };
  if (plain) return { level: 'bad', code: 'track-plain', text: `The camera can't recognize this artwork (${n} of ${of} test views). There isn't enough detail for it to hold on to: large plain areas look the same everywhere.${forStudent ? more : ''}` };
  if (wrongPlace || g === 'none') return { level: 'bad', code: 'track-repeat', text: `The camera can't recognize this artwork (${n} of ${of} test views). It has detail, but the detail repeats (grids, tiles, stripes, rows of the same shape), so the camera can't tell one part from another.${forStudent ? ' Break the pattern with things that appear only once.' : ''}` };
  return { level: 'bad', code: 'track-weak', text: `The camera rarely recognizes this artwork (${n} of ${of} test views).${more}` };
}

export async function gzip(buf) { return new Response(new Blob([buf]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer(); }
export const canGzip = () => 'CompressionStream' in globalThis;

// ---------------------------------------------------------------- the one-file hand-in (.livingart)
// A zip holding piece.json, art.jpg, the video, and the tracking data the student's device already worked out.
export async function writePackage(p) {
  const zip = new globalThis.JSZip();
  const vext = /webm/.test(p.video.type || '') || ext(p.video) === 'webm' ? 'webm' : 'mp4';
  const meta = {
    app: 'living-art', v: 1, pid: p.pid, title: p.title || '', artist: p.artist || '', statement: (p.statement || '').slice(0, SPEC.STATEMENT_MAX),
    w: p.w, h: p.h, made: new Date().toISOString(), image: 'art.jpg', video: `video.${vext}`,
    match: p.match ?? null, test: p.target?.test || null, compileMax: SPEC.COMPILE_MAX,
    target: p.target ? { w: p.target.width, h: p.target.height, score: p.target.score } : null,
  };
  zip.file('piece.json', JSON.stringify(meta, null, 2));
  zip.file('art.jpg', p.artBlob);
  zip.file(meta.video, p.video);
  if (p.target) zip.file('target.mind', exportTargets([p.target]));
  return zip.generateAsync({ type: 'blob', compression: 'STORE', mimeType: 'application/octet-stream' });
}
// zip: a loaded JSZip, root: folder prefix inside it ('' for a .livingart file)
export async function readPackageFrom(zip, root = '') {
  const f = (p) => zip.file(root + p);
  const meta = JSON.parse(await f('piece.json').async('string'));
  if (meta.app !== 'living-art') throw new Error('not a Living Art hand-in');
  const image = new File([await f(meta.image || 'art.jpg').async('blob')], 'art.jpg', { type: 'image/jpeg' });
  const vname = meta.video || 'video.mp4';
  const video = new File([await f(vname).async('blob')], vname, { type: vname.endsWith('webm') ? 'video/webm' : 'video/mp4' });
  let target = null;
  if (f('target.mind') && meta.compileMax === SPEC.COMPILE_MAX) {
    try { [target] = importTargets(await f('target.mind').async('arraybuffer')); target.test = meta.test || null; } catch (e) { log('package target unreadable', e); }
  }
  return { meta, image, video, target };
}
export async function readPackage(file) { return readPackageFrom(await globalThis.JSZip.loadAsync(file)); }

// ---------------------------------------------------------------- dropped folders and zips
// Turns a drop (files, folders, zips, Schoology bulk downloads, .livingart files) into a flat list of
// { file, folder } where folder is the name of the folder the file sat in ('' at the top level),
// plus packages: [{ meta, image, video, target, name }].
export async function gather(dataTransferOrFiles) {
  const loose = [], packages = [], skipped = [];
  const push = async (file, folder) => {
    if (/^\.|^__MACOSX|thumbs\.db$/i.test(file.name)) return;
    if (isPkg(file)) { try { packages.push({ ...(await readPackage(file)), name: file.name, folder }); } catch { skipped.push(file.name); } return; }
    if (isZip(file)) { await unzip(file, folder); return; }
    if (isImg(file) || isVid(file)) loose.push({ file, folder }); else skipped.push(file.name);
  };
  const unzip = async (file, outerFolder) => {
    let zip;
    try { zip = await globalThis.JSZip.loadAsync(file); } catch { skipped.push(file.name); return; }
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir && !/(^|\/)(\.|__MACOSX)/.test(n));
    // a zip that is itself a hand-in or contains unzipped hand-ins
    const roots = [];
    for (const pj of names.filter((n) => n.endsWith('piece.json'))) {
      const root = pj.slice(0, -'piece.json'.length);
      try { packages.push({ ...(await readPackageFrom(zip, root)), name: file.name, folder: root.replace(/\/$/, '').split('/').pop() || outerFolder }); roots.push(root); } catch { /* fall through to loose files */ }
    }
    const inPkg = (n) => roots.some((r) => n.startsWith(r));
    for (const n of names) {
      if (inPkg(n) || n.endsWith('gallery.json') || n.endsWith('.mind') || n.endsWith('.gz')) continue;
      const base = n.split('/').pop(), parent = n.split('/').slice(-2, -1)[0] || outerFolder || '';
      const blob = await zip.files[n].async('blob');
      const type = /\.(jpe?g)$/i.test(base) ? 'image/jpeg' : /\.png$/i.test(base) ? 'image/png' : /\.(mp4|m4v)$/i.test(base) ? 'video/mp4' : /\.mov$/i.test(base) ? 'video/quicktime' : /\.webm$/i.test(base) ? 'video/webm' : '';
      await push(new File([blob], base, { type }), parent);
    }
  };
  const walkEntry = async (entry, folder) => {
    if (entry.isFile) { const file = await new Promise((res, rej) => entry.file(res, rej)); await push(file, folder); return; }
    const reader = entry.createReader();
    for (;;) {
      const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const e of batch) await walkEntry(e, entry.name);
    }
  };
  const items = dataTransferOrFiles.items ? [...dataTransferOrFiles.items] : null;
  const entries = items ? items.map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)) : null;
  if (entries && entries.some(Boolean)) {
    const files = [...dataTransferOrFiles.files];
    for (const [i, e] of entries.entries()) { if (e) await walkEntry(e, ''); else if (files[i]) await push(files[i], ''); }
  } else {
    for (const file of (dataTransferOrFiles.files ? [...dataTransferOrFiles.files] : [...dataTransferOrFiles])) {
      const rel = file.webkitRelativePath || '';
      await push(file, rel ? rel.split('/').slice(-2, -1)[0] || '' : '');
    }
  }
  return { loose, packages, skipped };
}

// ---------------------------------------------------------------- small UI helpers shared by both pages
export function paintChecks(ul, checks, onFix) {
  ul.innerHTML = '';
  for (const c of checks) {
    const li = document.createElement('li'); li.className = c.level;
    const span = document.createElement('span'); span.textContent = c.text; li.append(span);
    if (c.fix && onFix) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'fix'; b.textContent = c.fix.label;
      b.onclick = () => onFix(c.fix.id, b);
      li.append(b);
    }
    ul.append(li);
  }
}
export function qrSvg(text) {
  const q = globalThis.qrcode(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

// ---------------------------------------------------------------- crop and straighten (student page)
// quad: four points in source pixels, in order top-left, top-right, bottom-right, bottom-left.
// Returns a new canvas holding the area inside the quad, pulled flat.
export function warpQuad(src, quad, maxSide = 1600) {
  const [p0, p1, p2, p3] = quad;
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  let W = Math.max(d(p0, p1), d(p3, p2)), H = Math.max(d(p0, p3), d(p1, p2));
  const k = Math.min(1, maxSide / Math.max(W, H));
  W = Math.max(8, Math.round(W * k)); H = Math.max(8, Math.round(H * k));
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
  let a, b, c, e, f, g, h, dd;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) { a = p1.x - p0.x; b = p2.x - p1.x; c = p0.x; dd = p1.y - p0.y; e = p2.y - p1.y; f = p0.y; g = 0; h = 0; }
  else {
    const den = dx1 * dy2 - dy1 * dx2;
    g = (dx3 * dy2 - dx2 * dy3) / den; h = (dx1 * dy3 - dy1 * dx3) / den;
    a = p1.x - p0.x + g * p1.x; b = p3.x - p0.x + h * p3.x; c = p0.x;
    dd = p1.y - p0.y + g * p1.y; e = p3.y - p0.y + h * p3.y; f = p0.y;
  }
  const sw = src.width, sh = src.height;
  const sdata = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const ox = out.getContext('2d'), od = ox.createImageData(W, H), o = od.data;
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W, w = g * u + h * v + 1;
      let sx = (a * u + b * v + c) / w - 0.5, sy = (dd * u + e * v + f) / w - 0.5;
      sx = sx < 0 ? 0 : sx > sw - 1.001 ? sw - 1.001 : sx; sy = sy < 0 ? 0 : sy > sh - 1.001 ? sh - 1.001 : sy;
      const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4, oi = (y * W + x) * 4;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      o[oi] = sdata[i00] * w00 + sdata[i10] * w10 + sdata[i01] * w01 + sdata[i11] * w11;
      o[oi + 1] = sdata[i00 + 1] * w00 + sdata[i10 + 1] * w10 + sdata[i01 + 1] * w01 + sdata[i11 + 1] * w11;
      o[oi + 2] = sdata[i00 + 2] * w00 + sdata[i10 + 2] * w10 + sdata[i01 + 2] * w01 + sdata[i11 + 2] * w11;
      o[oi + 3] = 255;
    }
  }
  ox.putImageData(od, 0, 0);
  return out;
}

// ---------------------------------------------------------------- try it before it is published
// Opens the real viewer over the page, fed with files that exist only on this device.
// local: { gallery, files: { 'art/01.jpg': Blob, 'video/01.mp4': Blob, 'targets.mind': Blob } }
export function openTryIt(local) {
  closeTryIt();
  window.__LA_LOCAL = local;
  const f = document.createElement('iframe');
  f.id = 'try-frame'; f.allow = 'camera; autoplay; fullscreen'; f.title = 'Try it';
  f.src = 'view.html?g=local';
  document.body.append(f);
  document.documentElement.style.overflow = 'hidden';
}
export function closeTryIt() {
  document.getElementById('try-frame')?.remove();
  document.documentElement.style.overflow = '';
  window.__LA_LOCAL = null;
}
window.addEventListener('message', (e) => { if (e.origin === location.origin && e.data && e.data.type === 'la-close') closeTryIt(); });

// ---------------------------------------------------------------- remember work on this device (best effort)
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('living-art', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function kv(mode, fn) {
  const db = await idb();
  try { return await new Promise((res, rej) => { const tx = db.transaction('kv', mode); const q = fn(tx.objectStore('kv')); tx.oncomplete = () => res(q ? q.result : undefined); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); }); }
  finally { db.close(); }
}
export const remember = (key, value) => kv('readwrite', (s) => s.put(value, key)).catch((e) => log('remember failed', e && e.name));
export const recall = (key) => kv('readonly', (s) => s.get(key)).catch(() => undefined);
export const forget = (key) => kv('readwrite', (s) => s.delete(key)).catch(() => {});

// Attach a "the page can fix this" button to the checks that have one.
const FIXES = {
  'vid-hevc': { id: 'convert', label: 'Convert it' }, 'vid-prores': { id: 'convert', label: 'Convert it' }, 'vid-webm': { id: 'convert', label: 'Convert to MP4' },
  'vid-play': { id: 'convert', label: 'Try converting it' }, 'vid-huge': { id: 'shrink', label: 'Make it smaller' }, 'vid-big': { id: 'shrink', label: 'Make it smaller' },
  shape: { id: 'shape', label: 'Crop the video to fit' },
};
export const withFixes = (checks) => checks.map((c) => (FIXES[c.code] ? { ...c, fix: FIXES[c.code] } : c));
// The tracking test alone, for artwork whose tracking data came with the file.
export function selfTestQueued(img, w, h, target) { const job = chain.then(() => selfTest(img, w, h, target)); chain = job.catch(() => {}); return job; }
