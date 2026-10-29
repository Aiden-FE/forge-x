/**
 * 查看侧元数据解析（唯一可测缝：字节 → 结构化分组视图）。
 *
 * - 词典靠 exifr full（平台硬约定：dynamic import 首用加载；默认入口即 full，
 *   含 PNG/TIFF 完整词典）。JPEG/TIFF 解 EXIF/XMP；PNG 解 eXIf chunk + XMP iTXt，
 *   tEXt/iTXt 文本条目由本模块原生扫描（exifr 的 ihdr 块显式关闭，避免结构字段混入）。
 * - 分组可读视图：基本信息 / 相机 / 拍摄参数 / GPS；另有「原始标签」全量列表（含 tag id）。
 * - entryCount = 分组条目总数，即「残留元数据」对比口径（清除后必须为 0）。
 * - ICC 不计入条目（白名单保留），仅以 hasIcc 结构检测展示。
 */
import { dmsArrayToDecimal, formatGpsDecimal, formatGpsDms } from './gps'
import { listPngTextEntries, pngHasIccProfile } from './pngChunk'
import { jpegHasIccProfile, loadPiexif } from './strip'
import type { PhotoFormat } from './validate'

export type MetadataGroupId = 'basic' | 'camera' | 'capture' | 'gps'

export interface MetadataEntry {
  key: string
  value: string
  group: MetadataGroupId
}

export interface MetadataGroup {
  id: MetadataGroupId
  entries: MetadataEntry[]
}

export interface RawTag {
  /** TIFF 数值 tag id（XMP / PNG 文本条目无 id） */
  id?: number
  name: string
  value: string
}

export interface GpsSummary {
  lat: number
  lon: number
  /** "39.904167° N, 116.391389° E" */
  decimal: string
  /** "39°54′15″ N, 116°23′29″ E" */
  dms: string
}

export interface InspectResult {
  format: PhotoFormat
  /** 分组条目总数（= 残留元数据对比口径） */
  entryCount: number
  groups: MetadataGroup[]
  rawTags: RawTag[]
  gps: GpsSummary | null
  /** ICC 颜色配置文件存在（结构检测；白名单保留项，不计入条目） */
  hasIcc: boolean
}

/* ---------------- exifr 首用加载 ---------------- */

interface ExifrLike {
  parse(data: Uint8Array, options?: Record<string, unknown>): Promise<Record<string, unknown> | undefined>
}

let exifrPromise: Promise<ExifrLike> | null = null

function loadExifr(): Promise<ExifrLike> {
  exifrPromise ??= (async () => {
    const mod = await import('exifr')
    const candidate = (mod as unknown as { default?: unknown }).default ?? mod
    if (!candidate || typeof (candidate as ExifrLike).parse !== 'function') {
      throw new ExifLoadError()
    }
    return candidate as ExifrLike
  })()
  return exifrPromise
}

class ExifLoadError extends Error {
  constructor() {
    super('exifr failed to load')
    this.name = 'ExifLoadError'
  }
}

/* ---------------- 解析选项与键分类 ---------------- */

/** 全量启用可剥离块；PNG 的 ihdr 结构块关闭（tEXt 由本模块原生扫描）。
 *  ICC 不经 exifr 解析：exifr 会把 ICC 字段平铺进顶层输出（无嵌套 icc 键），
 *  平铺字段会被误计为元数据条目——ICC 保留验证全部走结构检测（hasIcc）。 */
const PARSE_OPTIONS = { xmp: true, ihdr: false }

/** exifr 输出中的容器/计算键：非「元数据条目」，一律不计入分组视图。 */
const NON_TAG_KEYS = new Set([
  'errors', // exifr 解析期错误收集
  'icc', // 白名单保留项
  'latitude',
  'longitude', // exifr 计算键
  'ifd0',
  'exif',
  'gps',
  'interop',
  'xmp',
  'jfif',
  'iptc',
  'photoshop',
  'ihdr',
  'tiffHeaderOffset',
  'Thumbnail',
  'thumbnail',
])

const CAMERA_KEYS = new Set([
  'Make',
  'Model',
  'LensMake',
  'LensModel',
  'LensSerialNumber',
  'BodySerialNumber',
  'SerialNumber',
  'FirmwareVersion',
  'Software',
])

const CAPTURE_KEYS = new Set([
  'ExposureTime',
  'ExposureProgram',
  'ExposureBiasValue',
  'ShutterSpeedValue',
  'ApertureValue',
  'BrightnessValue',
  'FNumber',
  'ISO',
  'ISOSpeedRatings',
  'RecommendedExposureIndex',
  'FocalLength',
  'FocalLengthIn35mmFormat',
  'DigitalZoomRatio',
  'Flash',
  'WhiteBalance',
  'MeteringMode',
  'SceneCaptureType',
  'DateTimeOriginal',
  'CreateDate',
  'OffsetTimeOriginal',
])

const GPS_KEYS = new Set([
  'GPSLatitude',
  'GPSLatitudeRef',
  'GPSLongitude',
  'GPSLongitudeRef',
  'GPSAltitude',
  'GPSAltitudeRef',
  'GPSDateStamp',
  'GPSTimeStamp',
  'GPSImgDirection',
  'GPSImgDirectionRef',
  'GPSHPositioningError',
])

const GROUP_ORDER: MetadataGroupId[] = ['basic', 'camera', 'capture', 'gps']

function groupOf(key: string): MetadataGroupId {
  if (GPS_KEYS.has(key)) return 'gps'
  if (CAMERA_KEYS.has(key)) return 'camera'
  if (CAPTURE_KEYS.has(key)) return 'capture'
  return 'basic'
}

function stringifyValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString().replace('T', ' ').slice(0, 19)
  if (Array.isArray(value)) {
    return value.map((v) => stringifyValue(v)).join(', ')
  }
  if (typeof value === 'object' && 'description' in (value as Record<string, unknown>)) {
    return stringifyValue((value as Record<string, unknown>)['description'])
  }
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/** 原始标签值：二元数值数组按分数展示（如曝光 1/250），其余复用通用字符串化。 */
function rawValueString(value: unknown): string {
  if (Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === 'number')) {
    return `${value[0]}/${value[1]}`
  }
  return stringifyValue(value)
}

function isNumericKey(key: string): boolean {
  return /^\d+$/.test(key)
}

/** piexifjs 词典（ImageIFD/ExifIFD/GPSIFD 为 name→id 映射）反转一次，缓存复用。 */
let tagNameByIdPromise: Promise<Map<number, string>> | null = null

function getTagNameLookup(): Promise<Map<number, string>> {
  tagNameByIdPromise ??= (async () => {
    const piexif = await loadPiexif()
    const map = new Map<number, string>()
    for (const dict of [piexif.ImageIFD, piexif.ExifIFD, piexif.GPSIFD]) {
      for (const [name, id] of Object.entries(dict)) {
        const numericId = Number(id)
        if (Number.isInteger(numericId) && !map.has(numericId)) map.set(numericId, name)
      }
    }
    return map
  })()
  return tagNameByIdPromise
}

/* ---------------- 主入口 ---------------- */

export async function inspectPhoto(bytes: Uint8Array, format: PhotoFormat): Promise<InspectResult> {
  const exifr = await loadExifr()

  const groups: MetadataGroup[] = GROUP_ORDER.map((id) => ({ id, entries: [] }))
  const push = (key: string, value: string) => {
    const group = groupOf(key)
    groups.find((g) => g.id === group)!.entries.push({ key, value, group })
  }

  const parsed = await exifr.parse(bytes, {
    ...PARSE_OPTIONS,
    translateKeys: true,
    translateValues: true,
    reviveValues: true,
  })
  let latArr: number[] | undefined
  let lonArr: number[] | undefined
  let latRef: string | undefined
  let lonRef: string | undefined
  if (parsed) {
    for (const key of Object.keys(parsed)) {
      if (NON_TAG_KEYS.has(key)) continue
      const value = parsed[key]
      if (key === 'GPSLatitude' && Array.isArray(value)) {
        latArr = value.map(Number)
        latRef = typeof parsed['GPSLatitudeRef'] === 'string' ? (parsed['GPSLatitudeRef'] as string) : undefined
        push(key, formatGpsDms(latArr, latRef))
        continue
      }
      if (key === 'GPSLongitude' && Array.isArray(value)) {
        lonArr = value.map(Number)
        lonRef = typeof parsed['GPSLongitudeRef'] === 'string' ? (parsed['GPSLongitudeRef'] as string) : undefined
        push(key, formatGpsDms(lonArr, lonRef))
        continue
      }
      push(key, stringifyValue(value))
    }
  }

  // PNG 原生文本 chunk（tEXt / 未压缩 iTXt）：exifr ihdr 关闭后的补充视图
  if (format === 'png') {
    for (const entry of listPngTextEntries(bytes)) {
      push(entry.key, entry.value)
    }
  }

  let gps: GpsSummary | null = null
  if (latArr && lonArr) {
    const lat = dmsArrayToDecimal(latArr)
    const lon = dmsArrayToDecimal(lonArr)
    gps = {
      lat,
      lon,
      decimal: `${formatGpsDecimal(lat, latRef)}, ${formatGpsDecimal(lon, lonRef)}`,
      dms: `${formatGpsDms(latArr, latRef)}, ${formatGpsDms(lonArr, lonRef)}`,
    }
  }

  // 原始标签（含数值 tag id；词典名取自 piexifjs IFD 表——其为 name→id 映射，需反转）
  const raw = await exifr.parse(bytes, {
    ...PARSE_OPTIONS,
    translateKeys: false,
    translateValues: false,
    reviveValues: false,
  })
  const rawTags: RawTag[] = []
  if (raw) {
    const tagNameById = await getTagNameLookup()
    for (const key of Object.keys(raw)) {
      if (NON_TAG_KEYS.has(key)) continue
      if (isNumericKey(key)) {
        const id = Number(key)
        const name = tagNameById.get(id) ?? key
        rawTags.push({ id, name, value: rawValueString(raw[key]) })
      } else {
        rawTags.push({ name: key, value: rawValueString(raw[key]) })
      }
    }
  }
  if (format === 'png') {
    for (const entry of listPngTextEntries(bytes)) {
      rawTags.push({ name: entry.key, value: entry.value })
    }
  }

  const hasIcc =
    format === 'jpeg' ? jpegHasIccProfile(bytes) : format === 'png' ? pngHasIccProfile(bytes) : false

  const entryCount = groups.reduce((s, g) => s + g.entries.length, 0)
  return { format, entryCount, groups, rawTags, gps, hasIcc }
}
