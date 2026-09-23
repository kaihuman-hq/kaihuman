// Stand-in rows: the spike is about the window, not the content.
const ITEMS = [
  'Search Google for …',
  'Open the Lifosy console',
  'Add a note…',
  'Pinned tab groups…',
  'Switch repository…',
  'Sync with GitHub now',
  'Vitest guide',
  'Hyprland wiki',
];

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const input = document.getElementById('query');
const list = document.getElementById('rows');
const info = document.getElementById('info');
const card = document.getElementById('card');

let selected = 0;
let facts = '';

const render = () => {
  const needle = input.value.trim().toLowerCase();
  const matches = ITEMS.filter((item) => item.toLowerCase().includes(needle));
  selected = Math.min(selected, Math.max(0, matches.length - 1));
  list.replaceChildren(
    ...matches.map((item, index) => {
      const row = document.createElement('li');
      row.textContent = item;
      row.setAttribute('aria-selected', String(index === selected));
      return row;
    }),
  );
  return matches;
};

const hide = () => invoke('hide_palette');

input.addEventListener('input', () => {
  selected = 0;
  render();
});

input.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    hide();
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const total = render().length;
    if (total) selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) + total) % total;
    render();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const choice = render()[selected];
    info.textContent = `${facts} · picked “${choice ?? 'nothing'}”`;
  }
});

// In `layer` mode the surface covers the output: a click outside the card dismisses, as a click
// on another window would dismiss a launcher.
document.body.addEventListener('mousedown', (event) => {
  if (!card.contains(event.target)) hide();
});

await listen('palette:shown', async ({ payload: sentAt }) => {
  input.value = '';
  selected = 0;
  render();
  input.focus();
  // Two frames: the first is scheduled before the new frame is presented, the second after.
  requestAnimationFrame(() =>
    requestAnimationFrame(async () => {
      const latency = await invoke('painted', { sentAt });
      // Whether keys arrive is checked by typing: document.hasFocus() reads false on a layer
      // surface even while it holds the keyboard.
      info.textContent = `${facts} · opened in ${latency} ms`;
    }),
  );
});

const { mode, gdkBackend } = await invoke('spike_info');
document.body.classList.add(mode);
facts = `mode ${mode} · ${gdkBackend}`;
info.textContent = facts;
render();
await invoke('webview_ready');
