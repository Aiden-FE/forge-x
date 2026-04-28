import type { LocaleMessages } from './types'

const en: LocaleMessages = {
  brand: 'ForgeX',
  tagline: "Developer's Toolbox",
  search: 'Search tools... (Press /)',
  searchPlaceholder: 'Search tools...',
  home: 'Home',
  tool: 'Tool',
  noMatch: 'No matching tools',
  allCategories: 'All',
  categories: {
    encode: 'Encoding',
    format: 'Formatter',
    generate: 'Generator',
    convert: 'Convert',
  },
  theme: {
    toggleDark: 'Switch to dark theme',
    toggleLight: 'Switch to light theme',
  },
  lang: {
    switchToCn: 'Switch to Chinese',
    switchToEn: 'Switch to English',
  },
  tools: {
    'timestamp-converter': 'Timestamp Converter',
    'timestamp-converterDesc': 'Convert between Unix timestamp and date',
    'json-formatter': 'JSON Formatter',
    'json-formatterDesc': 'Format, minify and validate JSON',
    'base64-codec': 'Base64 Encoder/Decoder',
    'base64-codecDesc': 'Encode and decode Base64',
  },

  /* Tool internal UI text */
  timestamp: {
    label: 'Timestamp',
    placeholder: 'Enter timestamp (seconds or milliseconds)',
    toDate: 'Convert to Date',
    dateTime: 'Date & Time',
    placeholderDate: 'Enter date (YYYY-MM-DD HH:mm:ss)',
    toTimestamp: 'Convert to Timestamp',
    currentTs: 'Current Timestamp',
    currentTime: 'Current Time',
    result: 'Result',
    errInput: 'Please enter a timestamp',
    errInvalid: 'Invalid timestamp',
    errDatetime: 'Please enter a date & time',
    errInvalidDate: 'Invalid date format',
    seconds: 'seconds',
    milliseconds: 'milliseconds',
  },
  jsonFormatter: {
    label: 'Input JSON',
    placeholder: 'Paste JSON content...',
    format: 'Format',
    minify: 'Minify',
    copy: 'Copy',
    clear: 'Clear',
    output: 'Output',
    errParse: 'Parse error',
  },
  base64Codec: {
    label: 'Input',
    placeholder: 'Enter content to encode/decode...',
    encode: 'Encode → Base64',
    decode: 'Decode ← Base64',
    copy: 'Copy',
    clear: 'Clear',
    output: 'Output',
    errEncode: 'Encode error',
    errDecode: 'Decode error: please enter a valid Base64 string',
  },
}

export default en
