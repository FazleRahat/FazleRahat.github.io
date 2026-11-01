// Progressive theme selector. The stored choice is applied before first paint by
// the tiny inline script in BaseLayout; this module only wires up the control.
// Storage can be blocked, so every access is wrapped and failure is harmless.
const KEY = 'theme';

type Choice = 'system' | 'light' | 'dark';

function apply(choice: Choice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

function store(choice: Choice): void {
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* The choice still applies for this page view. */
  }
}

const control = document.querySelector<HTMLElement>('[data-theme-control]');
const select = control?.querySelector<HTMLSelectElement>('select');

if (control && select) {
  // Reflect what is actually applied (storage may have been unreadable).
  const attribute = document.documentElement.getAttribute('data-theme');
  select.value = attribute === 'light' || attribute === 'dark' ? attribute : 'system';
  control.hidden = false;

  select.addEventListener('change', () => {
    const choice = select.value as Choice;
    apply(choice);
    store(choice);
  });
}

export {};
