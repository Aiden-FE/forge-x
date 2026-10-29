// Ambient declarations for untyped third-party packages used by v0.3.0 tools.

declare module 'piexifjs' {
  // piexif.js is a CommonJS IIFE assigning the API object to module.exports.
  // IFD tag dicts map numeric tag -> tag name; only the members this project
  // uses are spelled out.
  export interface ExifDict {
    '0th': Record<number, unknown>
    Exif: Record<number, unknown>
    GPS: Record<number, unknown>
    Interop: Record<number, unknown>
    '1st': Record<number, unknown>
    thumbnail?: unknown
  }

  export const ImageIFD: Record<number, string>
  export const ExifIFD: Record<number, string>
  export const GPSIFD: Record<number, string>

  export const GPSHelper: {
    degToDmsRational(deg: number): [[number, number], [number, number], [number, number]]
    dmsRationalToDeg(dmsArray: [[number, number], [number, number], [number, number]], ref: string): number
  }

  /** Parses a JPEG binary string into an EXIF dict. Throws on non-JPEG data. */
  export function load(jpegData: string): ExifDict
  /** Serializes an EXIF dict back into an APP1 segment payload string. */
  export function dump(exifDict: ExifDict): string
  /** Removes ALL APP1 (EXIF) segments from a JPEG binary string. */
  export function remove(jpegData: string): string
}

declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown'

  type Plugin = TurndownService.Plugin

  export const gfm: Plugin & {
    tables: Plugin
    strikethrough: Plugin
    taskListItems: Plugin
  }
}
