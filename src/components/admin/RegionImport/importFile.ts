/**
 * Reading the chosen file in the browser, and the mistakes worth refusing before
 * anything is uploaded.
 *
 * ⚠ **Decoded strictly.** `File.text()` decodes as UTF-8 and silently replaces
 * every byte it cannot read with U+FFFD, so a Windows Excel "CSV" (Windows-1252)
 * arrived as `M�nchen` and was published that way. A fatal decoder refuses it
 * here, where the volunteer can still save the file again. The upload endpoint
 * refuses U+FFFD too, for a caller that is not this page.
 */

/** Matches the upload endpoint's own character cap, with room for multi-byte text. */
export const MAX_IMPORT_FILE_BYTES = 1_000_000

export type ImportFileResult = { ok: true; text: string } | { ok: false; error: string }

/** What a spreadsheet saved in its own format starts with (a ZIP archive). */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]
/** An old binary Excel file (OLE compound document). */
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0]

export async function readImportFile(file: File): Promise<ImportFileResult> {
  if (file.size === 0) return { ok: false, error: 'This file is empty.' }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return {
      ok: false,
      error: `This file is ${Math.round(file.size / 1000)} KB — more than one import can hold. Split it into smaller files.`,
    }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (startsWith(bytes, ZIP_MAGIC) || startsWith(bytes, OLE_MAGIC)) {
    return {
      ok: false,
      error:
        'This is a spreadsheet file, not a CSV. In your spreadsheet choose File → Save as (or Download) → "CSV UTF-8", and upload that.',
    }
  }
  if (startsWith(bytes, [0xff, 0xfe]) || startsWith(bytes, [0xfe, 0xff])) {
    return {
      ok: false,
      error: 'This file is saved as UTF-16 ("Unicode text"). Save it as "CSV UTF-8" instead.',
    }
  }

  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  } catch {
    return {
      ok: false,
      error:
        'This file is not saved as UTF-8, so its accented letters would be garbled. Save it as "CSV UTF-8" (Excel: File → Save as → CSV UTF-8) and upload that.',
    }
  }
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte)
}
