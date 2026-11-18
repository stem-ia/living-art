// Small MP4/MOV box tools for Living Art. No dependencies; works on an ArrayBuffer.
// - inspect():   codecs, where private metadata lives, and whether the file is laid out for streaming
// - videoCodec(): 'h264' plays everywhere; 'hevc' is Safari-only in practice
// - clean():     erases the boxes where phones store GPS location, device model and names,
//                and moves the index (moov) to the front so playback starts before the whole file has downloaded.
//                The picture and sound bytes are untouched.

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'mvex', 'moof', 'traf']);
const fourcc = (view, off) => String.fromCharCode(view.getUint8(off), view.getUint8(off + 1), view.getUint8(off + 2), view.getUint8(off + 3));

function readBoxes(view, start, end, fn) {
  let off = start;
  while (off + 8 <= end) {
    let size = view.getUint32(off);
    const type = fourcc(view, off + 4);
    let hdr = 8;
    if (size === 1) { if (off + 16 > end) return; size = Number(view.getBigUint64(off + 8)); hdr = 16; }
    else if (size === 0) size = end - off;
    if (size < hdr || off + size > end) return;
    fn(type, off, hdr, size);
    off += size;
  }
}

export function inspect(buffer) {
  const view = new DataView(buffer);
  const out = { codecs: [], privateBoxes: [], chunkTables: [], top: [], hasLocation: false, isMp4: false, brand: '', fastStart: true, fragmented: false };
  readBoxes(view, 0, buffer.byteLength, (type, off, hdr, size) => {
    out.top.push({ type, off, size });
    if (type === 'ftyp') { out.isMp4 = true; out.brand = fourcc(view, off + hdr).trim(); }
    if (type === 'moof') out.fragmented = true;
    if (type === 'moov') walk(view, off + hdr, off + size, out, 'moov');
  });
  const moov = out.top.find((b) => b.type === 'moov'), mdat = out.top.find((b) => b.type === 'mdat');
  if (moov && !out.isMp4) out.isMp4 = true; // old QuickTime files have no ftyp
  out.fastStart = !moov || !mdat || moov.off < mdat.off;
  return out;
}

function walk(view, start, end, out, parent) {
  readBoxes(view, start, end, (type, off, hdr, size) => {
    if (type === 'udta' || (type === 'meta' && parent === 'moov')) {
      out.privateBoxes.push({ off, hdr, size });
      if (hasLocationBytes(view, off, Math.min(off + size, off + 65536))) out.hasLocation = true;
    } else if (type === 'stsd') {
      const count = view.getUint32(off + hdr + 4);
      let e = off + hdr + 8;
      for (let i = 0; i < count && e + 8 <= off + size; i++) {
        const esz = view.getUint32(e);
        out.codecs.push(fourcc(view, e + 4));
        if (esz < 8) break;
        e += esz;
      }
    } else if (type === 'stco' || type === 'co64') {
      out.chunkTables.push({ type, off: off + hdr, count: view.getUint32(off + hdr + 4) });
    } else if (CONTAINERS.has(type)) walk(view, off + hdr, off + size, out, type);
  });
}

// GPS lives in a '\xa9xyz' atom (QuickTime), a 'loci' box (3GPP) or a 'com.apple.quicktime.location.ISO6709' key.
function hasLocationBytes(view, start, end) {
  const pats = [[0xa9, 0x78, 0x79, 0x7a], [0x6c, 0x6f, 0x63, 0x69], [0x6c, 0x6f, 0x63, 0x61, 0x74, 0x69, 0x6f, 0x6e]];
  for (let i = start; i < end - 8; i++) {
    for (const p of pats) {
      let ok = true;
      for (let k = 0; k < p.length; k++) if (view.getUint8(i + k) !== p[k]) { ok = false; break; }
      if (ok) return true;
    }
  }
  return false;
}

const VIDEO_CODECS = { avc1: 'h264', avc3: 'h264', hvc1: 'hevc', hev1: 'hevc', dvh1: 'hevc', dvhe: 'hevc', av01: 'av1', vp09: 'vp9', mp4v: 'mpeg4', apcn: 'prores', apch: 'prores', apcs: 'prores', apco: 'prores', ap4h: 'prores' };

export function videoCodec(info) {
  for (const c of info.codecs) if (VIDEO_CODECS[c]) return VIDEO_CODECS[c];
  return info.codecs.length ? 'unknown' : null;
}

// Returns { blob, stripped, movedIndex }.
// 1. Private boxes become 'free' boxes filled with zeros (same size, so nothing else in the file moves).
// 2. If the index sits after the media data, it is moved to the front and the chunk offsets inside it are shifted to match.
export function clean(buffer, info = inspect(buffer)) {
  if (!info.isMp4) return { blob: new Blob([buffer]), stripped: 0, movedIndex: false };
  const bytes = new Uint8Array(buffer.slice(0));
  for (const { off, hdr, size } of info.privateBoxes) {
    bytes[off + 4] = 0x66; bytes[off + 5] = 0x72; bytes[off + 6] = 0x65; bytes[off + 7] = 0x65; // 'free'
    bytes.fill(0, off + hdr, off + size);
  }
  const moovs = info.top.filter((b) => b.type === 'moov'), mdats = info.top.filter((b) => b.type === 'mdat');
  const canMove = !info.fastStart && !info.fragmented && moovs.length === 1 && mdats.length >= 1 && info.chunkTables.length > 0;
  if (!canMove) return { blob: new Blob([bytes]), stripped: info.privateBoxes.length, movedIndex: false };

  const moov = moovs[0], firstMdat = mdats[0];
  const view = new DataView(bytes.buffer);
  // every chunk between the insertion point and the old index position moves down by the size of the index
  for (const t of info.chunkTables) {
    for (let i = 0; i < t.count; i++) {
      if (t.type === 'stco') {
        const p = t.off + 8 + i * 4, v = view.getUint32(p);
        if (v >= firstMdat.off && v < moov.off) {
          if (v + moov.size > 0xffffffff) return { blob: new Blob([bytes]), stripped: info.privateBoxes.length, movedIndex: false };
          view.setUint32(p, v + moov.size);
        }
      } else {
        const p = t.off + 8 + i * 8, v = view.getBigUint64(p);
        if (v >= BigInt(firstMdat.off) && v < BigInt(moov.off)) view.setBigUint64(p, v + BigInt(moov.size));
      }
    }
  }
  const parts = [bytes.subarray(0, firstMdat.off), bytes.subarray(moov.off, moov.off + moov.size), bytes.subarray(firstMdat.off, moov.off), bytes.subarray(moov.off + moov.size)];
  return { blob: new Blob(parts), stripped: info.privateBoxes.length, movedIndex: true };
}

// Kept for older callers.
export function stripPrivateMetadata(buffer, info) { const r = clean(buffer, info); return { blob: r.blob, stripped: r.stripped }; }
