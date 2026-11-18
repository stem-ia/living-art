// Living Art video converter. Built from this file with esbuild into lib/convert.js.
// Wraps Mediabunny (MPL-2.0, https://mediabunny.dev) so the builder and the student page can
// turn any video the browser can decode into a small H.264 MP4 that plays on every device.
import { Input, Output, Conversion, BlobSource, BufferTarget, Mp4OutputFormat, MP4, QTFF, WEBM, MATROSKA, Quality, canEncodeVideo } from 'mediabunny';

const even = (n) => Math.max(2, Math.round(n / 2) * 2);

// What is in the file, and can this browser decode it?
export async function probe(file) {
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA] });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) return { ok: false, reason: 'no-video' };
    const audio = await input.getPrimaryAudioTrack();
    const [codec, w, h, canDecode, duration] = await Promise.all([
      video.getCodec(), video.getDisplayWidth(), video.getDisplayHeight(), video.canDecode(), input.computeDuration(),
    ]);
    return { ok: true, codec, w, h, canDecode, duration, hasAudio: !!audio, canEncode: await canEncodeVideo('avc', { width: 1280, height: 720 }).catch(() => false) };
  } catch (e) {
    return { ok: false, reason: 'unreadable', error: String(e && e.message || e) };
  } finally { input.dispose(); }
}

// opts: { maxSide = 1280, maxMB = 6, fps = 30, aspect (w/h to crop to), maxSeconds, onProgress(0..1) }
export async function convert(file, opts = {}) {
  const { maxSide = 1280, maxMB = 6, fps = 30, aspect = 0, maxSeconds = 0, onProgress } = opts;
  const input = new Input({ source: new BlobSource(file), formats: [MP4, QTFF, WEBM, MATROSKA] });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error('no-video');
    if (!(await video.canDecode())) throw new Error('cannot-decode');
    const [dw, dh, total] = await Promise.all([video.getDisplayWidth(), video.getDisplayHeight(), input.computeDuration()]);
    const dur = maxSeconds ? Math.min(total, maxSeconds) : total;

    // centre crop to the artwork's shape when asked
    let crop, cw = dw, ch = dh;
    if (aspect && Math.abs(dw / dh - aspect) / aspect > 0.01) {
      if (dw / dh > aspect) cw = dh * aspect; else ch = dw / aspect;
      cw = Math.round(cw); ch = Math.round(ch);
      crop = { left: Math.round((dw - cw) / 2), top: Math.round((dh - ch) / 2), width: cw, height: ch };
    }
    const s = Math.min(1, maxSide / Math.max(cw, ch));
    const width = even(cw * s), height = even(ch * s);

    // pick a bitrate that lands under maxMB, capped so short clips don't balloon
    const audioBits = 128000;
    const budget = (maxMB * 8e6 * 0.94) / Math.max(1, dur) - audioBits;
    const pixelCap = Math.round(width * height * fps * 0.11); // about 3 Mbps at 720p30
    const bitrate = Math.round(Math.max(500000, Math.min(budget, pixelCap, 3500000)));

    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input, output, tracks: 'primary', showWarnings: false,
      trim: maxSeconds && total > maxSeconds ? { start: 0, end: maxSeconds } : undefined,
      tags: () => ({}), // carry no metadata across (location, device, names)
      video: { codec: 'avc', width, height, fit: 'fill', crop, frameRate: fps, quality: new Quality({ bitrate }), keyFrameInterval: 2, allowTransformationMetadata: false },
      audio: { codec: 'aac' }, // AAC sound is copied as is; anything else is re-encoded when the device can
    });
    if (!conversion.isValid || !conversion.utilizedTracks.some((t) => t.isVideoTrack())) {
      const why = conversion.discardedTracks.find((d) => d.track.isVideoTrack());
      throw new Error(why ? why.reason : 'invalid');
    }
    const audioDropped = conversion.discardedTracks.some((d) => d.track.isAudioTrack());
    if (onProgress) conversion.onProgress = (p) => onProgress(p);
    await conversion.execute();
    const buf = output.target.buffer;
    const name = file.name.replace(/\.[^.]+$/, '') + '.mp4';
    return { file: new File([buf], name, { type: 'video/mp4' }), width, height, bitrate, audioDropped, cropped: !!crop, trimmed: !!(maxSeconds && total > maxSeconds) };
  } finally { input.dispose(); }
}
