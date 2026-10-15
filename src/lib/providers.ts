export const CHAT_COMPLETIONS_PATH = '/v1/chat/completions'

/**
 * A provider baseURL is an origin only. The OpenAI-compatible request path is
 * owned by ForgeX so a user cannot accidentally point records at another path.
 */
export function normalizeProviderBaseUrl(input: string): string | null {
  try {
    const url = new URL(input.trim())
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      return null
    }
    return url.origin
  } catch {
    return null
  }
}

export function buildChatCompletionsUrl(baseURL: string): string {
  const normalizedBaseURL = normalizeProviderBaseUrl(baseURL)
  if (!normalizedBaseURL) {
    throw new TypeError('Provider baseURL must be a valid HTTP(S) root address')
  }
  return `${normalizedBaseURL}${CHAT_COMPLETIONS_PATH}`
}
