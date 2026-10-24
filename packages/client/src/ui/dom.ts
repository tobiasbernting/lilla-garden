// Minimal DOM helpers.

type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> | null = null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'disabled' || k === 'checked') (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export const clear = (el: HTMLElement): void => {
  while (el.firstChild) el.removeChild(el.firstChild);
};

export const icon = (url: string, alt = ''): HTMLImageElement => h('img', { src: url, alt, draggable: 'false' });

/** Fire on tap/click without the 300ms delay and without double firing. */
export function onTap(el: HTMLElement, fn: (ev: Event) => void): void {
  let handled = 0;
  el.addEventListener('pointerup', (ev) => {
    if (ev.button !== 0) return;
    handled = performance.now();
    fn(ev);
  });
  el.addEventListener('click', (ev) => {
    if (performance.now() - handled < 500) return;
    fn(ev);
  });
}
