export function safeBufferFrom(arrayBuffer: ArrayBuffer): Buffer {
  return Buffer.from(arrayBuffer)
}

export function safeBufferFromUint8Array(uint8Array: Uint8Array): Buffer {
  return Buffer.from(uint8Array)
}
