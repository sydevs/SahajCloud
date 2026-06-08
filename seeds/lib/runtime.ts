/**
 * Runtime Utilities (Node.js)
 *
 * Buffer conversion helpers.
 */

/**
 * Create a Buffer from an ArrayBuffer.
 *
 * @param arrayBuffer - The ArrayBuffer to convert
 * @returns A Buffer containing the same data
 */
export function safeBufferFrom(arrayBuffer: ArrayBuffer): Buffer {
  return Buffer.from(arrayBuffer)
}

/**
 * Create a Buffer from a Uint8Array.
 *
 * @param uint8Array - The Uint8Array to convert
 * @returns A Buffer containing the same data
 */
export function safeBufferFromUint8Array(uint8Array: Uint8Array): Buffer {
  return Buffer.from(uint8Array)
}
