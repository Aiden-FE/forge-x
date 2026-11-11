/**
 * 键盘事件目标是否为文本输入区域。
 *
 * 平台级全局快捷键（如顶栏的 `/` 聚焦搜索）必须在用户正在输入时让路，
 * 否则输入框 / 文本域里的字符会被吞掉。覆盖浏览器原生文本控件（input、
 * textarea、select）以及 contenteditable 区域（含其子节点）。
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target instanceof HTMLElement && target.isContentEditable
}
