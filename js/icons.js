/* Line icon set (16px grid, stroke = currentColor) */
const ICON_PATHS = {
  foryou: '<circle cx="8" cy="8" r="6.25"/><circle cx="8" cy="6.5" r="2.25"/><path d="M4.2 12.6c.8-1.6 2.2-2.4 3.8-2.4s3 .8 3.8 2.4"/>',
  clock: '<circle cx="8" cy="8" r="6.25"/><path d="M8 4.5V8l2.5 1.5"/>',
  star: '<path d="M8 1.9l1.85 3.8 4.15.6-3 2.95.7 4.15L8 11.45 4.3 13.4l.7-4.15-3-2.95 4.15-.6z" stroke-linejoin="round"/>',
  starFill: '<path d="M8 1.9l1.85 3.8 4.15.6-3 2.95.7 4.15L8 11.45 4.3 13.4l.7-4.15-3-2.95 4.15-.6z" fill="currentColor" stroke-linejoin="round"/>',
  apps: '<rect x="2" y="2" width="4.5" height="4.5" rx="1"/><rect x="9.5" y="2" width="4.5" height="4.5" rx="1"/><rect x="2" y="9.5" width="4.5" height="4.5" rx="1"/><path d="M11.75 9.25v5M9.25 11.75h5"/>',
  plans: '<path d="M2 3.5h8M2 8h12M6 12.5h8"/>',
  spaces: '<path d="M9.8 2.3c1.9-.6 3.4-.4 3.9.1s.7 2-.1 3.9c-.8 2-2.6 4.2-5.1 5.6l-2.5-2.5C7.4 6.9 7.8 3 9.8 2.3z" stroke-linejoin="round"/><path d="M6 9.4l-2.8.3L2.4 12M6.6 10l-.3 2.8L3.9 13.6" stroke-linejoin="round"/>',
  filter: '<path d="M2 4h12M4.5 8h7M7 12h2"/>',
  dashboard: '<rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M7 2v12M7 7.5h7"/>',
  teams: '<rect x="2" y="2" width="12" height="12" rx="2" fill="currentColor" stroke="none"/><circle cx="5.7" cy="6" r="1.4" fill="var(--surface)" stroke="none"/><circle cx="10.3" cy="6" r="1.4" fill="var(--surface)" stroke="none"/><path d="M3.8 11.3c.4-1.2 1.1-1.8 1.9-1.8s1.5.6 1.9 1.8M8.4 11.3c.4-1.2 1.1-1.8 1.9-1.8s1.5.6 1.9 1.8" stroke="var(--surface)"/>',
  projects: '<rect x="2" y="2" width="12" height="12" rx="2" fill="currentColor" stroke="none"/><path d="M9.6 4.8c1-.3 1.7-.2 1.9 0s.3.9 0 1.9c-.4 1-1.3 2-2.5 2.7L7.6 8c.6-1.3 1-2.8 2-3.2zM6.6 8.8l-1.4.2-.5 1.2M7.2 9.4l-.2 1.4-1.2.5" stroke="var(--surface)" stroke-linejoin="round"/>',
  external: '<path d="M9 2.5h4.5V7M13.5 2.5L7.5 8.5M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3"/>',
  chevronRight: '<path d="M6 3.5L10.5 8 6 12.5"/>',
  chevronLeft: '<path d="M10 3.5L5.5 8 10 12.5"/>',
  chevronDown: '<path d="M3.5 6L8 10.5 12.5 6"/>',
  chevronUp: '<path d="M3.5 10L8 5.5l4.5 4.5"/>',
  plus: '<path d="M8 2.5v11M2.5 8h11"/>',
  more: '<circle cx="3.25" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="12.75" cy="8" r="1.1" fill="currentColor" stroke="none"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.4 10.4L14 14"/>',
  share: '<circle cx="11.8" cy="3.8" r="1.8"/><circle cx="4.2" cy="8" r="1.8"/><circle cx="11.8" cy="12.2" r="1.8"/><path d="M5.8 7.1l4.4-2.4M5.8 8.9l4.4 2.4"/>',
  bolt: '<path d="M9 1.8L3.5 9h4l-.8 5.2L12.5 7h-4z" stroke-linejoin="round"/>',
  feedback: '<path d="M2.5 3.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H7l-3 2.5v-2.5h-.5a1 1 0 0 1-1-1z" stroke-linejoin="round"/><path d="M5.5 6.75h5"/>',
  fullscreen: '<path d="M9.5 2.5h4v4M13.5 2.5L9 7M6.5 13.5h-4v-4M2.5 13.5L7 9"/>',
  globe: '<circle cx="8" cy="8" r="6.25"/><path d="M1.75 8h12.5M8 1.75c1.8 1.7 2.6 3.8 2.6 6.25S9.8 12.55 8 14.25C6.2 12.55 5.4 10.45 5.4 8S6.2 3.45 8 1.75z"/>',
  board: '<rect x="2" y="2.5" width="12" height="11" rx="1.25"/><path d="M6 2.5v11M10 2.5v11"/>',
  list: '<rect x="2" y="2.5" width="12" height="11" rx="1.25"/><path d="M2 6.25h12M2 9.75h12M6 6.25v7.25"/>',
  calendar: '<rect x="2" y="3" width="12" height="11" rx="1.25"/><path d="M2 6.5h12M5.25 1.5v3M10.75 1.5v3"/>',
  timeline: '<path d="M2.5 3.5h7M4.5 8h9M2.5 12.5h6"/>',
  approvals: '<path d="M4 2v4.5c0 1.6 1.2 2.8 2.8 3.4L8 10.4V14M12 2v4.5c0 1-.4 1.9-1.2 2.5"/><path d="M2.5 3.5L4 2l1.5 1.5M10.5 3.5L12 2l1.5 1.5"/>',
  forms: '<path d="M2.5 3.5h11M2.5 6.5h11M2.5 9.5h7M2.5 12.5h5"/><rect x="11" y="10.5" width="3" height="3" rx=".5"/>',
  docs: '<rect x="2.5" y="2.5" width="11" height="11" rx="1.25"/><path d="M5 5.5h6M5 8h6M5 10.5h3.5"/>',
  attach: '<path d="M13 7.5l-5.1 5.1a3 3 0 0 1-4.3-4.2L9 3a2 2 0 0 1 2.8 2.9L6.5 11.2a1 1 0 0 1-1.4-1.4L10 4.9"/>',
  reports: '<path d="M2 2v12h12"/><path d="M4.5 10.5l3-3.5 2 2 4-4.5"/><path d="M11 4.5h2.5V7"/>',
  people: '<circle cx="5.75" cy="5.25" r="2.25"/><circle cx="11.25" cy="6" r="1.75"/><path d="M1.75 13c.4-2.3 2-3.6 4-3.6s3.6 1.3 4 3.6M10.5 9.5c1.7-.2 3.2.9 3.7 3"/>',
  sliders: '<path d="M2 4.5h6M11 4.5h3M2 11.5h3M8 11.5h6"/><circle cx="9.5" cy="4.5" r="1.5"/><circle cx="6.5" cy="11.5" r="1.5"/>',
  group: '<path d="M8 1.75l6 3.25-6 3.25L2 5z" stroke-linejoin="round"/><path d="M2 8.25l6 3.25 6-3.25M2 11.25l6 3.25 6-3.25" stroke-linejoin="round"/>',
  bulb: '<path d="M5.5 10.8C4.3 9.9 3.5 8.6 3.5 7a4.5 4.5 0 0 1 9 0c0 1.6-.8 2.9-2 3.8v1.2h-5z" stroke-linejoin="round"/><path d="M6 14h4"/>',
  close: '<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>',
  check: '<path d="M3 8.5l3.25 3.25L13 5"/>',
  checkCircle: '<circle cx="8" cy="8" r="6.25"/><path d="M5.25 8.25l1.9 1.9 3.6-3.9"/>',
  trash: '<path d="M2.5 4h11M6 4V2.5h4V4M4 4l.6 9.5h6.8L12 4M6.75 6.5v4.5M9.25 6.5v4.5"/>',
  edit: '<path d="M10.5 2.5l3 3-8 8H2.5v-3z" stroke-linejoin="round"/>',
  arrowRight: '<path d="M2.5 8h11M9.5 4l4 4-4 4"/>',
  arrowLeft: '<path d="M13.5 8h-11M6.5 4l-4 4 4 4"/>',
  bell: '<path d="M3.5 11.5V7.25a4.5 4.5 0 0 1 9 0v4.25l1 1.25h-11z" stroke-linejoin="round"/><path d="M6.5 14.25h3"/>',
  help: '<circle cx="8" cy="8" r="6.25"/><path d="M6.2 6.2a1.9 1.9 0 0 1 3.7.4c0 1.3-1.9 1.6-1.9 2.9"/><circle cx="8" cy="11.6" r=".6" fill="currentColor" stroke="none"/>',
  gear: '<circle cx="8" cy="8" r="2.25"/><path d="M8 1.5l1.2 1.6 2-.3.6 1.9 1.8.9-.6 1.9 1 1.5-1.5 1.3.1 2-2 .2-.9 1.8L8 13.5l-1.7.8-.9-1.8-2-.2.1-2L2 9l1-1.5-.6-1.9 1.8-.9.6-1.9 2 .3z" stroke-linejoin="round"/>',
  sidebar: '<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M6 2.5v11"/>',
  appSwitcher: '<g fill="currentColor" stroke="none"><circle cx="3.5" cy="3.5" r="1.2"/><circle cx="8" cy="3.5" r="1.2"/><circle cx="12.5" cy="3.5" r="1.2"/><circle cx="3.5" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="12.5" cy="8" r="1.2"/><circle cx="3.5" cy="12.5" r="1.2"/><circle cx="8" cy="12.5" r="1.2"/><circle cx="12.5" cy="12.5" r="1.2"/></g>',
  comment: '<path d="M2.5 3.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H7l-3 2.5v-2.5h-.5a1 1 0 0 1-1-1z" stroke-linejoin="round"/>',
  subtask: '<rect x="2" y="2" width="12" height="12" rx="2.5"/><path d="M5.5 5v3.5h5M8.5 6.5l2 2-2 2"/>',
  folder: '<path d="M1.75 4.25a1 1 0 0 1 1-1h3.5l1.5 1.5h5.5a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1z" stroke-linejoin="round"/>',
  drag: '<g fill="currentColor" stroke="none"><circle cx="6" cy="4" r="1"/><circle cx="10" cy="4" r="1"/><circle cx="6" cy="8" r="1"/><circle cx="10" cy="8" r="1"/><circle cx="6" cy="12" r="1"/><circle cx="10" cy="12" r="1"/></g>',
  sun: '<circle cx="8" cy="8" r="2.75"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"/>',
  moon: '<path d="M13 9.6A5.5 5.5 0 0 1 6.4 3a5.5 5.5 0 1 0 6.6 6.6z" stroke-linejoin="round"/>',
  download: '<path d="M8 2v8.5M4.5 7L8 10.5 11.5 7M2.5 13.5h11"/>',
  upload: '<path d="M8 10.5V2M4.5 5.5L8 2l3.5 3.5M2.5 13.5h11"/>',
  eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
  collapse: '<path d="M5 3.5L9.5 8 5 12.5"/><path d="M11 3v10"/>',
  link: '<path d="M7 9a2.5 2.5 0 0 0 3.5 0l2.3-2.3a2.5 2.5 0 0 0-3.5-3.5L8.5 4M9 7a2.5 2.5 0 0 0-3.5 0L3.2 9.3a2.5 2.5 0 0 0 3.5 3.5l.8-.8"/>',
  hierarchy: '<rect x="5.5" y="1.75" width="5" height="3.5" rx=".75"/><rect x="1.75" y="10.75" width="5" height="3.5" rx=".75"/><rect x="9.25" y="10.75" width="5" height="3.5" rx=".75"/><path d="M8 5.25v2.75M4.25 10.75V8h7.5v2.75"/>',
  image: '<rect x="2" y="2.5" width="12" height="11" rx="1.25"/><circle cx="5.75" cy="6" r="1.25"/><path d="M2 11.5l3.5-3 3 2.5 2-1.5 3.5 3"/>',
  file: '<path d="M4 1.75h5l3.5 3.5v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-10.5a1 1 0 0 1 1-1z" stroke-linejoin="round"/><path d="M9 1.75v3.5h3.5"/>',
  refresh: '<path d="M13.5 7.5A5.5 5.5 0 1 0 12 11.4"/><path d="M13.5 3v4.5H9"/>',
  sort: '<path d="M5 3v10M2.5 10.5L5 13l2.5-2.5M11 13V3M8.5 5.5L11 3l2.5 2.5"/>',
  lock: '<rect x="3" y="7" width="10" height="7" rx="1.25"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
  legend: '<rect x="2" y="3" width="3" height="3" rx=".5"/><rect x="2" y="10" width="3" height="3" rx=".5"/><path d="M7.5 4.5h6.5M7.5 11.5h6.5"/>',
  sparkle: '<path d="M8 1.5l1.5 4.5L14 7.5l-4.5 1.5L8 13.5 6.5 9 2 7.5 6.5 6z" stroke-linejoin="round"/>',
  logo: '<path d="M8 1.5L14 8l-6 6.5L2 8z" fill="currentColor" stroke="none"/><path d="M8 5l3 3-3 3-3-3z" fill="var(--surface)" stroke="none"/>',
  task: '<rect x="1.5" y="1.5" width="13" height="13" rx="2.5" fill="#4688EC" stroke="none"/><path d="M4.75 8.25l2.1 2.1 4.4-4.6" stroke="#fff" stroke-width="1.75"/>',
  subtaskType: '<rect x="1.5" y="1.5" width="13" height="13" rx="2.5" fill="#42B2D7" stroke="none"/><rect x="4.25" y="4.25" width="4.5" height="4.5" rx=".75" stroke="#fff" stroke-width="1.4"/><rect x="7.25" y="7.25" width="4.5" height="4.5" rx=".75" fill="#42B2D7" stroke="#fff" stroke-width="1.4"/>',
  bug: '<rect x="1.5" y="1.5" width="13" height="13" rx="2.5" fill="#F15B50" stroke="none"/><circle cx="8" cy="8" r="3" fill="#fff" stroke="none"/>',
  emptyWork: '<rect x="3" y="4" width="10" height="8" rx="1.5"/><path d="M5.5 8.25l1.6 1.6 3.4-3.6"/><path d="M5 4V2.75h8.25V10H13"/>',
  /* apps */
  funnel: '<path d="M2 3h12l-4.5 5.25v4.5L6.5 14V8.25z" stroke-linejoin="round"/>',
  building: '<rect x="3" y="1.75" width="7" height="12.5" rx="1"/><path d="M10 6.25h2.25a1 1 0 0 1 1 1v7H10M5.25 4.5h2.5M5.25 7h2.5M5.25 9.5h2.5M6.5 14.25v-2"/>',
  quote: '<path d="M4 1.75h5l3.5 3.5v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-10.5a1 1 0 0 1 1-1z" stroke-linejoin="round"/><path d="M9 1.75v3.5h3.5M5.5 8.5h5M5.5 11h3"/>',
  receipt: '<path d="M3.5 1.75h9v12.5l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1z" stroke-linejoin="round"/><path d="M5.75 5h4.5M5.75 7.5h4.5M5.75 10h2.5"/>',
  box: '<path d="M8 1.75l5.75 3v6.5L8 14.25l-5.75-3v-6.5z" stroke-linejoin="round"/><path d="M2.25 4.75L8 7.75l5.75-3M8 7.75v6.5"/>',
  wallet: '<rect x="1.75" y="3.5" width="12.5" height="10" rx="1.5"/><path d="M1.75 6.25h12.5M10.5 9.75h1.5"/><path d="M3.5 3.5l6.5-1.75.5 1.75"/>',
  megaphone: '<path d="M2.25 6.25v3.5h2.5l6 3.25V3l-6 3.25z" stroke-linejoin="round"/><path d="M4.75 9.75l.75 3.5h1.75l-.5-3M12.75 6.25v3.5"/>',
  video: '<rect x="1.75" y="4" width="8.75" height="8" rx="1.5"/><path d="M10.5 7l3.75-2.25v6.5L10.5 9z" stroke-linejoin="round"/>',
  pin: '<path d="M8 14.25s4.5-4.2 4.5-7.75a4.5 4.5 0 0 0-9 0c0 3.55 4.5 7.75 4.5 7.75z" stroke-linejoin="round"/><circle cx="8" cy="6.5" r="1.6"/>',
  checklist: '<path d="M2.25 4l1.25 1.25L5.75 3M2.25 9l1.25 1.25L5.75 8"/><path d="M8 4.25h5.75M8 9.25h5.75M8 13h5.75"/>',
  calc: '<rect x="3" y="1.75" width="10" height="12.5" rx="1.5"/><rect x="5" y="3.75" width="6" height="2.5" rx=".5"/><path d="M5.5 9h.01M8 9h.01M10.5 9h.01M5.5 11.75h.01M8 11.75h.01M10.5 11.75h.01" stroke-width="2"/>',
  plane: '<path d="M14 2L1.75 7l4.5 1.75L8 13.25 14 2z" stroke-linejoin="round"/><path d="M6.25 8.75L14 2"/>',
  login: '<path d="M9.5 2.5h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3M2.5 8h7.5M7 5l3 3-3 3"/>',
  logout: '<path d="M6.5 2.5h-3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3M6 8h7.5M10.5 5l3 3-3 3"/>',
  print: '<path d="M4 5.5V1.75h8V5.5M4 11.5H2.75a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h10.5a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H12"/><rect x="4" y="9" width="8" height="5.25" rx=".5"/>',
  copy: '<rect x="5" y="5" width="9" height="9" rx="1.25"/><path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2"/>',
  phone: '<path d="M3 2.25h2.5l1.25 3-1.5 1a7.5 7.5 0 0 0 4.5 4.5l1-1.5 3 1.25v2.5a1 1 0 0 1-1 1A11.25 11.25 0 0 1 2 3.25a1 1 0 0 1 1-1z" stroke-linejoin="round"/>',
  mail: '<rect x="1.75" y="3.25" width="12.5" height="9.5" rx="1.25"/><path d="M2.25 4l5.75 4.5L13.75 4"/>',
  rupee: '<path d="M4 2.5h8M4 5.5h8M6 2.5c2.75 0 4 1.25 4 3s-1.5 3-4 3H4.5l5.5 5"/>',
  drop: '<path d="M8 1.75S3.5 6.5 3.5 9.75a4.5 4.5 0 0 0 9 0C12.5 6.5 8 1.75 8 1.75z" stroke-linejoin="round"/>',
  home: '<path d="M2 7.25L8 2l6 5.25M3.75 6v7.25h8.5V6" stroke-linejoin="round"/><path d="M6.5 13.25v-3.5h3v3.5"/>',
};

function icon(name, size = 16, cls = '') {
  const p = ICON_PATHS[name] || '';
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">${p}</svg>`;
}

const PRIORITY_ICONS = {
  highest: '<path d="M3.5 8.5L8 4l4.5 4.5M3.5 12.5L8 8l4.5 4.5" stroke="#F15B50" stroke-width="1.75"/>',
  high: '<path d="M3.5 10.5L8 6l4.5 4.5" stroke="#F15B50" stroke-width="1.75"/>',
  medium: '<path d="M3 6.25h10M3 9.75h10" stroke="#FCA700" stroke-width="1.75"/>',
  low: '<path d="M3.5 5.5L8 10l4.5-4.5" stroke="#4688EC" stroke-width="1.75"/>',
  lowest: '<path d="M3.5 3.5L8 8l4.5-4.5M3.5 7.5L8 12l4.5-4.5" stroke="#4688EC" stroke-width="1.75"/>',
};
function priorityIcon(p, size = 16) {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PRIORITY_ICONS[p] || PRIORITY_ICONS.medium}</svg>`;
}

/* Space avatar: colored rounded square with a small glyph */
function spaceAvatar(space, size = 20) {
  const glyphs = {
    calendar: '<rect x="4" y="5" width="12" height="11" rx="1.5" fill="#fff"/><rect x="4" y="5" width="12" height="3.5" rx="1.5" fill="rgba(0,0,0,.25)"/><rect x="7" y="10.5" width="2.5" height="2.5" rx=".5" fill="' + space.color + '"/>',
    chart: '<rect x="4.5" y="9" width="2.5" height="6.5" rx=".6" fill="#fff"/><rect x="8.75" y="5" width="2.5" height="10.5" rx=".6" fill="#fff"/><rect x="13" y="7.5" width="2.5" height="8" rx=".6" fill="#fff" opacity=".8"/>',
    mountain: '<path d="M3 15.5l5-7 3 4 2-2.5 4 5.5z" fill="#fff"/><circle cx="14" cy="6" r="1.8" fill="#fff"/>',
    rocket: '<path d="M12.5 4c2-.5 3 0 3.4.4s.9 1.5.4 3.4c-.6 2-2.3 4.1-4.6 5.4l-2.5-2.5C10.5 8.4 10.5 4.5 12.5 4z" fill="#fff"/><path d="M8.8 11.2l-3 .4-1.2 2.6 3.2-.8M9.2 11.8l-.4 3 2.6-1.2" fill="#fff"/>',
    bulb: '<path d="M7 13c-1.4-1-2.3-2.4-2.3-4.1a5.3 5.3 0 0 1 10.6 0c0 1.7-.9 3.1-2.3 4.1v1.5H7z" fill="#fff"/>',
    star: '<path d="M10 3.5l1.9 3.9 4.3.6-3.1 3 .7 4.3L10 13.3l-3.8 2 .7-4.3-3.1-3 4.3-.6z" fill="#fff"/>',
  };
  return `<svg class="space-av" width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true"><rect width="20" height="20" rx="4.5" fill="${space.color}"/>${glyphs[space.glyph] || glyphs.calendar}</svg>`;
}

function typeIcon(type, size = 16) {
  const map = { task: 'task', subtask: 'subtaskType', bug: 'bug' };
  return icon(map[type] || 'task', size, 'type-ic');
}
