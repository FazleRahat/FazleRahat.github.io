// Progressive copy buttons. A button is revealed only when the Clipboard API is
// available, and "copied" is announced only after the write actually succeeds.
//
//   <button data-copy="element-id" data-copy-success="…" data-copy-fallback="…" hidden>
//   <span data-copy-status role="status"></span>    (inside the same [data-copy-scope])
const canCopy = typeof navigator !== 'undefined' && window.isSecureContext && typeof navigator.clipboard?.writeText === 'function';

function announce(button: HTMLElement, message: string): void {
  const scope = button.closest('[data-copy-scope]');
  const status = scope?.querySelector<HTMLElement>('[data-copy-status]');
  if (status) status.textContent = message;
}

// The visible confirmation: a small bubble above the button for a couple of seconds. Screen readers
// already get the message from the status region, so the bubble is hidden from them.
const toasts = new WeakMap<HTMLElement, { element: HTMLElement; timer: number }>();

function showToast(button: HTMLElement, message: string): void {
  const previous = toasts.get(button);
  if (previous) {
    window.clearTimeout(previous.timer);
    previous.element.remove();
  }
  const element = document.createElement('span');
  element.className = 'copy-toast';
  element.setAttribute('aria-hidden', 'true');
  element.textContent = message;
  document.body.append(element);

  // Centred over the button, kept inside the viewport, and below it when there is no room above.
  const anchor = button.getBoundingClientRect();
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  const margin = 8;
  const left = Math.min(Math.max(anchor.left + anchor.width / 2 - width / 2, margin), document.documentElement.clientWidth - width - margin);
  const above = anchor.top - height - margin;
  element.style.left = `${left + window.scrollX}px`;
  element.style.top = `${(above >= margin ? above : anchor.bottom + margin) + window.scrollY}px`;
  requestAnimationFrame(() => element.classList.add('is-visible'));

  const timer = window.setTimeout(() => {
    element.remove();
    toasts.delete(button);
  }, 2400);
  toasts.set(button, { element, timer });
}

function selectContents(element: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

if (canCopy) {
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
    button.hidden = false;
    button.addEventListener('click', async () => {
      const target = document.getElementById(button.dataset.copy ?? '');
      if (!target) return;
      const text = target.dataset.copyValue ?? target.textContent ?? '';
      try {
        await navigator.clipboard.writeText(text);
        const message = button.dataset.copySuccess ?? 'Copied.';
        announce(button, message);
        showToast(button, message);
      } catch {
        selectContents(target);
        const message = button.dataset.copyFallback ?? 'Select and copy the text.';
        announce(button, message);
        showToast(button, message);
      }
    });
  }
}

export {};
