/** Clickable controls that count as a real tool interaction. */
const INTERACTIVE_SELECTOR = [
  'input',
  'textarea',
  'select',
  'button',
  'a[href]',
  'label',
  'summary',
  '[role="button"]',
  '[contenteditable="true"]',
].join(', ')

/**
 * A tool page visit counts as "actual use" on the first input, change, drop,
 * paste, or click on an interactive control inside the tool content area.
 * Merely opening the page, scrolling, or focusing does not count.
 */
export function isUsageEvent(event: Pick<Event, 'type' | 'target'>): boolean {
  if (
    event.type === 'input' ||
    event.type === 'change' ||
    event.type === 'drop' ||
    event.type === 'paste'
  ) {
    return true
  }
  if (event.type !== 'click') return false

  const target = event.target
  if (target === null || typeof (target as Element).closest !== 'function') return false
  return (target as Element).closest(INTERACTIVE_SELECTOR) !== null
}

export interface ToolUsageGate {
  hit: () => void
  reset: () => void
}

/**
 * Records at most one use per tool-page visit. The gate is reset when the
 * mounted tool changes; it is intentionally not reset on every interaction.
 */
export function createToolUsageGate(record: () => void): ToolUsageGate {
  let recorded = false
  return {
    hit() {
      if (recorded) return
      recorded = true
      record()
    },
    reset() {
      recorded = false
    },
  }
}
