/**
 * `seconds` of constant-bitrate MP3 carrying no Xing or Info header — the
 * shape of most songs uploaded before #1202. Its length is stated only as size
 * over bitrate, so a reader told nothing of its size finds none (#1210).
 *
 * Built rather than stored: each frame is an MPEG-1 Layer III header (32 kbps,
 * 48 kHz, no padding — 96 bytes, 24 ms) followed by silence.
 */
export const cbrMp3WithoutInfoHeader = (seconds: number): Buffer => {
  const frame = Buffer.alloc(96)
  frame.writeUInt32BE(0xfffb1400, 0)
  return Buffer.concat(Array<Buffer>(Math.round(seconds / 0.024)).fill(frame))
}

/** `bytes` as the body of a fetch response. */
export const byteStream = (bytes: Buffer): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes))
      controller.close()
    },
  })
