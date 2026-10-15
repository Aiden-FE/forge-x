export function encodeUrlText(value: string): string {
  return encodeURIComponent(value)
}

export function decodeUrlText(value: string): string {
  return decodeURIComponent(value)
}
