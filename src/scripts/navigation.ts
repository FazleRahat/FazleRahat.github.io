// Enhancements for the native <details> mobile menu. Without this script the
// menu still opens and closes; this adds Escape, close-after-navigation and
// close-on-outside-click, plus returning focus to the summary.
const menu = document.querySelector<HTMLDetailsElement>('details.nav-menu');

if (menu) {
  const summary = menu.querySelector<HTMLElement>('summary');

  const close = (returnFocus: boolean): void => {
    if (!menu.open) return;
    menu.open = false;
    if (returnFocus) summary?.focus();
  };

  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    }
  });

  menu.addEventListener('click', (event) => {
    if ((event.target as Element).closest('a')) close(false);
  });

  document.addEventListener('click', (event) => {
    if (menu.open && !menu.contains(event.target as Node)) close(false);
  });

  // If the viewport grows to the inline-nav layout, do not leave the disclosure open.
  window.matchMedia('(min-width: 60em)').addEventListener('change', (event) => {
    if (event.matches) close(false);
  });
}

// The footer can sit below other content, so briefly mark the addresses a link to it has jumped to.
const contact = document.querySelector<HTMLElement>('#contact');

if (contact) {
  let timer = 0;

  document.addEventListener('click', (event) => {
    if (!(event.target as Element).closest('a[href="#contact"]')) return;
    contact.classList.add('email-highlight');
    window.clearTimeout(timer);
    timer = window.setTimeout(() => contact.classList.remove('email-highlight'), 1800);
  });
}

export {};
