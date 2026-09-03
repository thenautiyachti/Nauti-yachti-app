// Pixel dimensions read straight from an image's header bytes.
//
// The gallery lays out justified rows, which means it has to know each photo's
// shape before the browser has loaded it -- otherwise the page reflows as the
// images arrive. Reading the header needs no image library and no more than
// the first few hundred KB of the file.

function imageSize(buf) {
  if (!buf || buf.length < 24) return null;

  // PNG: width and height are at fixed offsets inside the IHDR chunk.
  if (buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // GIF: little-endian, straight after the header.
  if (buf.slice(0, 3).toString("latin1") === "GIF") {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }

  // WebP (VP8X / VP8L / VP8 ), inside a RIFF container.
  if (buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP") {
    const chunk = buf.slice(12, 16).toString("latin1");
    if (chunk === "VP8X") return { width: (buf.readUIntLE(24, 3) & 0xffffff) + 1, height: (buf.readUIntLE(27, 3) & 0xffffff) + 1 };
    if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    return null;
  }

  // JPEG: walk the segment chain to a start-of-frame marker, which is the only
  // place the real dimensions live. Skipping by each segment's declared length
  // is what keeps this from tripping over dimensions inside an embedded EXIF
  // thumbnail.
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    // SOF0-SOF15, excluding the Huffman/arithmetic tables that share the range.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

// Fetches only as much of a remote image as the header needs.
async function remoteImageSize(url, redirects = 0) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow" });
    if (!res.ok) return null;
    const reader = res.body.getReader();
    const parts = [];
    let total = 0;
    while (total < 300000) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      total += value.length;
    }
    try { await reader.cancel(); } catch {}
    return imageSize(Buffer.concat(parts.map((p) => Buffer.from(p))));
  } catch {
    return null;
  }
}

module.exports = { imageSize, remoteImageSize };
