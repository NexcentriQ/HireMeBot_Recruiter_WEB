/**
 * SHA-256 helpers for browser-side content hashing of resume uploads.
 *
 * The hex digest is what the backend's upload-url + register APIs expect.
 * The base64 digest is already supplied by the backend in `requiredHeaders`
 * for the S3 PUT (`x-amz-checksum-sha256`), so the frontend never has to
 * build it itself.
 */

function isWebCryptoAvailable(): boolean {
  return (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.subtle.digest === 'function'
  )
}

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}

/**
 * Compute the SHA-256 hex digest of the complete bytes of a Blob/File.
 * Requires a secure context (HTTPS or localhost) because it relies on
 * Web Crypto. Throws if the API is unavailable.
 */
export async function sha256Hex(blob: Blob): Promise<string> {
  if (!isWebCryptoAvailable()) {
    throw new Error(
      'Secure hashing is not available in this browser context. Use HTTPS or localhost.'
    )
  }
  // Prefer Blob.arrayBuffer() where available; fall back via Response for
  // environments where Blob does not expose it (older jsdom builds do this).
  const buffer: ArrayBuffer =
    typeof (blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> })
      .arrayBuffer === 'function'
      ? await blob.arrayBuffer()
      : await new Response(blob).arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return bufferToHex(digest)
}
