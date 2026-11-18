// biome-ignore-all lint/correctness/noUnusedVariables: globals shared with the page scripts
// Shared mockup kit: icons, tiles, phone chrome. Pages call render(...) into #root.
const P = {
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  flame:
    'M12 21c-4 0-6.5-2.8-6.5-6.3 0-3.7 3-5.6 3.5-9.2 2.3 1.3 3 3.5 3 5 1-.6 1.8-1.8 2-3 2.2 1.8 4.5 4.3 4.5 7.3 0 3.5-2.5 6.2-6.5 6.2z',
  wallet: 'M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V7zm0 0l11-3v3M16 13.5h.01',
  chart: 'M4 18l5-6 4 3 7-8M4 21h16',
  globe:
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.6 3.5 5.6 3.5 9s-1 6.4-3.5 9c-2.5-2.6-3.5-5.6-3.5-9s1-6.4 3.5-9z',
  cal: 'M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  book: 'M5 4h9a4 4 0 0 1 4 4v12H8a3 3 0 0 1-3-3V4zM5 17a3 3 0 0 1 3-3h10',
  rss: 'M5 19h.01M5 11a8 8 0 0 1 8 8M5 4a15 15 0 0 1 15 15',
  bm: 'M7 3h10a1 1 0 0 1 1 1v17l-6-4-6 4V4a1 1 0 0 1 1-1z',
  term: 'M5 7l5 5-5 5M12 18h7',
  spark:
    'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2 2.2.8-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  plane: 'M3 13l7-2 4-7h2l-1.5 7 5 1.5L21 15l-6-.5-3 5h-2l1-5.5-6-.5z',
  board: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v7h-4z',
  cup: 'M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V8zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v2M12 3v2',
  db: 'M12 9c4 0 7-1.3 7-3s-3-3-7-3-7 1.3-7 3 3 3 7 3zM5 6v12c0 1.7 3 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3 3 7 3s7-1.3 7-3',
  home: 'M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.2 1 2.1h5c0-.9.4-1.7 1-2.1A6 6 0 0 0 12 3z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  note: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  pen: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
  chev: 'M9 6l6 6-6 6',
  chevd: 'M6 9l6 6 6-6',
  back: 'M15 6l-6 6 6 6',
  play: 'M8 5l11 7-11 7z',
  stop: 'M7 7h10v10H7z',
  brain:
    'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a3 3 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1',
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
  flag: 'M5 21V4h11l-2 4 2 4H5',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  repeat: 'M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4',
};
const I = (n, w = 2) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"><path d="${P[n]}"/></svg>`;
const head = (ic, c, t) => `<div class="th"><span class="ic c-${c}">${I(ic, 2.2)}</span>${t}</div>`;
const qa = (ic = 'plus', g = '') => `<div class="qa ${g}">${I(ic, 2.6)}</div>`;
const spark = (pts, col = 'var(--hi)', fill = true, h = 34, w = 146) => {
  const mx = Math.max(...pts),
    mn = Math.min(...pts),
    sx = w / (pts.length - 1);
  const xy = pts.map((p, i) => [i * sx, h - 3 - ((p - mn) / (mx - mn || 1)) * (h - 6)]);
  const d = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const l = xy[xy.length - 1];
  return `<svg width="${w}" height="${h}" style="display:block;overflow:visible">${fill ? `<path d="${d} L${w} ${h} L0 ${h}Z" fill="${col}" opacity=".18"/>` : ''}<path d="${d}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${l[0]}" cy="${l[1]}" r="3.5" fill="${col}"/></svg>`;
};
const bars = (v, hl = v.length - 1, h = 34) => {
  const mx = Math.max(...v);
  return `<div style="display:flex;gap:4px;align-items:flex-end;height:${h}px">${v.map((x, i) => `<i style="flex:1;height:${Math.max(3, (x / mx) * h)}px;border-radius:4px;background:${i === hl ? 'var(--hi)' : 'var(--track)'}"></i>`).join('')}</div>`;
};
const ring = (p, s = 54, col = 'var(--hi)', txt = '') => {
  const r = s / 2 - 4,
    c = 2 * Math.PI * r;
  return `<svg width="${s}" height="${s}" style="display:block"><circle cx="${s / 2}" cy="${s / 2}" r="${r}" stroke="var(--track)" stroke-width="7" fill="none"/><circle cx="${s / 2}" cy="${s / 2}" r="${r}" stroke="${col}" stroke-width="7" fill="none" stroke-linecap="round" stroke-dasharray="${c * p} ${c}" transform="rotate(-90 ${s / 2} ${s / 2})"/>${txt ? `<text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="700" font-family="ui-monospace,monospace" fill="var(--label)">${txt}</text>` : ''}</svg>`;
};
const days = (s, lbl = true) =>
  `<div class="days">${[...s].map((c, i) => `<i class="${c === '1' ? 'on' : c === 'h' ? 'half' : ''}${i === s.length - 1 ? ' td' : ''}"></i>`).join('')}</div>${lbl ? '<div class="dl"><span>T</span><span>F</span><span>S</span><span>S</span><span>M</span><span>T</span><span>W</span></div>' : ''}`;
const T = {
  todos: () => `<div class="tile">${head('check', 'lime', 'Todos')}${qa()}<div class="sp"></div>
 <div style="display:flex;gap:14px;align-items:flex-end"><div><div class="hero">7</div><div class="hl">open</div></div><div><div class="hero" style="color:var(--info)">2</div><div class="hl">doing</div></div><div style="margin-left:auto;text-align:right"><div class="hero" style="font-size:22px;color:var(--warning)">1</div><div class="hl">overdue</div></div></div>
 <div class="viz"><div class="seg"><b style="flex:2;background:var(--info)"></b><b style="flex:4;background:var(--hi)"></b><b style="flex:1;background:var(--warning)"></b><b style="flex:3;background:var(--track)"></b></div></div></div>`,
  habit: () =>
    `<div class="tile">${head('flame', 'orange', 'Meditate')}${qa('check')}<div class="sp"></div><div class="hero">12<small>days</small></div><div class="hl">streak · best 31</div><div class="viz">${days('1101111')}</div></div>`,
  time: () =>
    `<div class="tile">${head('clock', 'blue', 'Time')}${qa('stop', 'ghost')}<div class="sp"></div><div class="hl" style="margin:0 0 4px;color:var(--label);font-weight:600"><span class="live"></span>Deep work</div><div class="hero" style="font-size:30px">1:24:07</div><div class="hl">today 3h 52m</div><div class="viz">${bars([2, 5, 3, 6, 4, 1, 4], 6, 22)}</div></div>`,
  consumption: () =>
    `<div class="tile">${head('cup', 'orange', 'Coffee')}${qa()}<div class="sp"></div><div class="hero">3<small>/ 4</small></div><div class="hl">cups today · avg 2.6</div><div class="viz"><div class="pills"><i class="on"></i><i class="on"></i><i class="on"></i><i></i></div></div></div>`,
  consumptionMeter: () =>
    `<div class="tile">${head('db', 'blue', 'Electricity')}${qa()}<div class="sp"></div><div class="hero">412<small>kWh</small></div><div class="hl"><span class="dn">▲ 8%</span> vs Oct last year</div><div class="viz">${spark([30, 34, 31, 38, 36, 41, 44], 'var(--info)')}</div></div>`,
  events: () =>
    `<div class="tile">${head('cal', 'red', 'Events')}${qa()}<div class="sp"></div><div class="hero">3<small>days</small></div><div class="t1" style="margin-top:6px">Mom's birthday</div><div class="hl">Fri 14 Nov · +2 this month</div></div>`,
  budget: () =>
    `<div class="tile">${head('wallet', 'green', 'Budget')}${qa()}<div class="sp"></div><div class="hero" style="font-size:30px">1,240</div><div class="hl">left of 2,000 · Nov</div><div class="viz"><div class="seg" style="height:10px"><b style="flex:3;background:var(--success)"></b><b style="flex:2;background:var(--info)"></b><b style="flex:1;background:var(--violet)"></b><b style="flex:6;background:var(--track)"></b></div><div class="leg"><span><i style="background:var(--success)"></i>Food</span><span><i style="background:var(--info)"></i>Home</span></div></div></div>`,
  board: () =>
    `<div class="tile">${head('board', 'lime', 'Board')}<div class="sp"></div><div class="hero">23</div><div class="hl">open · <span style="color:var(--warning)">2 overdue</span></div><div class="viz" style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;align-items:end;height:40px">${[
      [9, 'In'],
      [5, 'Do'],
      [14, 'Bk'],
      [6, 'Rv'],
    ]
      .map(
        ([n, l], i) =>
          `<div style="text-align:center"><i style="display:block;height:${n * 2}px;border-radius:5px;background:${i === 1 ? 'var(--info)' : 'var(--track)'}"></i><span style="font-size:9px;color:var(--sec);font-weight:600">${l} ${n}</span></div>`,
      )
      .join('')}</div></div>`,
  actionlog: () =>
    `<div class="tile">${head('pen', 'violet', 'Log')}${qa()}<div class="sp"></div><div class="hero">5</div><div class="hl">entries today</div><div class="viz" style="font-size:12.5px;font-weight:500;line-height:1.35"><div style="color:var(--sec);font-size:11px;font-family:var(--mono)">14:20</div><div class="t1" style="font-size:13px;font-weight:500">Ran 5 km along the river</div></div></div>`,
  stocks: () =>
    `<div class="tile">${head('chart', 'green', 'Portfolio')}<div class="sp"></div><div class="hero" style="font-size:28px">48.2k</div><div class="hl"><span class="up">▲ 2.4%</span> · +1,130 MTD</div><div class="viz">${spark([40, 42, 41, 44, 43, 46, 45, 48], 'var(--success)')}</div></div>`,
  tz: () =>
    `<div class="tile">${head('globe', 'blue', 'Clocks')}<div class="sp"></div><div class="hero" style="font-size:30px">09:41</div><div class="hl">Prague · Tue</div><div class="kv"><div><span class="s">New York</span><span>03:41</span></div><div><span class="s">Tokyo</span><span>17:41</span></div></div></div>`,
  travel: () =>
    `<div class="tile">${head('plane', 'blue', 'Travel')}${qa()}<div class="sp"></div><div class="hero">18<small>days</small></div><div class="t1" style="margin-top:6px">Lisbon</div><div class="hl">28 Nov – 3 Dec · 4 steps</div></div>`,
  readlater: () =>
    `<div class="tile">${head('book', 'violet', 'Read later')}${qa()}<div class="sp"></div><div class="hero">14</div><div class="hl">unread · ~2h</div><div class="viz"><div class="t1" style="font-size:13px">The quiet power of plain text</div></div></div>`,
  rss: () =>
    `<div class="tile">${head('rss', 'orange', 'Feeds')}<div class="sp"></div><div class="hero">9</div><div class="hl">unread · 4 feeds</div><div class="viz"><div class="t1" style="font-size:13px">Expo SDK 56: what's new</div></div></div>`,
  data: () =>
    `<div class="tile">${head('db', 'lime', 'Weight')}${qa()}<div class="sp"></div><div class="hero">78.2<small>kg</small></div><div class="hl"><span class="up">▼ 0.6</span> · 30 days</div><div class="viz">${spark([80.1, 79.8, 79.9, 79.4, 79.1, 78.9, 78.6, 78.2])}</div></div>`,
  bookmarks: () =>
    `<div class="tile">${head('bm', 'blue', 'Bookmarks')}${qa()}<div class="sp"></div><div class="hero">128</div><div class="hl">saved · 6 this week</div><div class="viz" style="display:flex;gap:6px">${['G', 'M', 'Y', 'H', '+3'].map((x, i) => `<span style="width:${i < 4 ? 26 : 32}px;height:26px;border-radius:8px;background:var(--fill);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--sec)">${x}</span>`).join('')}</div></div>`,
  prompts: () =>
    `<div class="tile">${head('spark', 'violet', 'Prompts')}<div class="sp"></div><div class="hero">24</div><div class="hl">templates</div><div class="viz"><span class="chip" style="display:inline-flex;gap:5px;align-items:center;font-size:12px;padding:5px 10px">Summarize thread ⧉</span></div></div>`,
  commands: () =>
    `<div class="tile">${head('term', 'lime', 'Commands')}<div class="sp"></div><div class="hero">12</div><div class="hl">snippets</div><div class="viz"><span class="chip" style="font-family:var(--mono);font-size:11.5px;padding:5px 10px">pnpm run check ⧉</span></div></div>`,
  palette: () =>
    `<div class="tile" style="opacity:.55;border:1.5px dashed var(--ter);box-shadow:none;background:transparent">${head('sliders', 'lime', 'Palette')}<div class="sp"></div><div class="hero" style="font-size:22px">→ More</div><div class="hl">moved to Settings</div><div class="hl">not a glance tile</div></div>`,
};
const tabs = (open = false) =>
  `<div class="tabs"><div class="tab on">${I('home')}Today</div><div class="tab">${I('board')}Board</div><div class="tab"><div class="fab ${open ? 'open' : ''}">${I('plus', 2.6)}</div></div><div class="tab">${I('bulb')}Ideas</div><div class="tab">${I('more', 3)}More</div></div>`;
const sb = () =>
  `<div class="island"></div><div class="sb"><span>9:41</span><span class="sbi"><svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="2.5" width="3" height="9.5" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg><svg width="26" height="12" viewBox="0 0 26 12"><rect x=".5" y=".5" width="22" height="11" rx="3.5" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="17" height="8" rx="2" fill="currentColor"/></svg></span></div>`;
const dhead = (name, pg) =>
  `<div class="dh"><div class="date">Tuesday 10 November</div><div class="row"><div class="name">${name}${I('chevd', 2.4)}</div><div class="avatar">AU</div></div><div class="dots" style="margin-top:8px">${[0, 1, 2].map((i) => `<i class="${i === pg ? 'on' : ''}"></i>`).join('')}</div></div>`;
const phone = (theme, inner) =>
  `<div class="${theme}"><div class="phone"><div class="screen">${sb()}${inner}<div class="homebar"></div></div></div></div>`;
const ann = (n, txt, x, y) =>
  `<div class="ann" data-n="${n}" style="left:${x}px;top:${y}px">${txt}</div>`;
const pair = (fn, labels = ['Light', 'Dark']) =>
  ['light', 'dark']
    .map((t, i) => `<div><div class="cap">${labels[i]}</div>${phone(t, fn(t))}</div>`)
    .join('');
const notes = (sections) =>
  `<div class="notes">${sections.map(([h, items]) => `<h3>${h}</h3><ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul>`).join('')}</div>`;
