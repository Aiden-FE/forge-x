export interface LocaleMessages {
  brand: string
  tagline: string
  search: string
  searchPlaceholder: string
  home: string
  tool: string
  noMatch: string
  allCategories: string
  categories: {
    encode: string
    format: string
    generate: string
    convert: string
  }
  theme: {
    toggleDark: string
    toggleLight: string
  }
  lang: {
    switchToCn: string
    switchToEn: string
  }
  tools: {
    timestampConverter: string
    timestampConverterDesc: string
    jsonFormatter: string
    jsonFormatterDesc: string
    base64Codec: string
    base64CodecDesc: string
  }
  [key: string]: any
}
