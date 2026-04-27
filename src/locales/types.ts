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
  timestamp: {
    label: string
    placeholder: string
    toDate: string
    dateTime: string
    placeholderDate: string
    toTimestamp: string
    currentTs: string
    currentTime: string
    result: string
    errInput: string
    errInvalid: string
    errDatetime: string
    errInvalidDate: string
    seconds: string
    milliseconds: string
  }
  jsonFormatter: {
    label: string
    placeholder: string
    format: string
    minify: string
    copy: string
    clear: string
    output: string
    errParse: string
  }
  base64Codec: {
    label: string
    placeholder: string
    encode: string
    decode: string
    copy: string
    clear: string
    output: string
    errEncode: string
    errDecode: string
  }
  [key: string]: any
}
