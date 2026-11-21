import type { CategoryId, ThemeName, ThemeSetting } from './types';

interface Tokens {
  dark: boolean;
  bg: string;
  surface: string;
  sunken: string;
  text: string;
  muted: string;
  faint: string;
  line: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  accentInk: string;
  now: string;
}

export const THEMES: Record<ThemeName, Tokens & { blurb: string }> = {
  Paper: { blurb: 'Warm white, ink-blue accent', dark: false, bg: '#F6F5F2', surface: '#FFFFFF', sunken: '#F0EEEA', text: '#1C1B19', muted: '#68645D', faint: '#8C877F', line: '#E6E3DD', accent: '#3651D4', accentText: '#FFFFFF', accentSoft: '#E7EBFD', accentInk: '#2A3FA8', now: '#E03131' },
  Midnight: { blurb: 'Deep navy for late nights', dark: true, bg: '#0D1016', surface: '#151A22', sunken: '#1B212B', text: '#E8EBEF', muted: '#9AA4B1', faint: '#7D8794', line: '#252C37', accent: '#86A1FF', accentText: '#0D1016', accentSoft: '#1C2747', accentInk: '#B4C5FF', now: '#FF6B6B' },
  Sage: { blurb: 'Soft green, unhurried', dark: false, bg: '#EFF3EE', surface: '#FFFFFF', sunken: '#E9EFE7', text: '#18221B', muted: '#55655A', faint: '#7A877D', line: '#D8E1D5', accent: '#2C7A55', accentText: '#FFFFFF', accentSoft: '#DCEFE3', accentInk: '#1F5E40', now: '#D9480F' },
  Dusk: { blurb: 'Plum and amber for evenings', dark: true, bg: '#16121B', surface: '#201A27', sunken: '#28212F', text: '#F0EAF4', muted: '#AFA4B9', faint: '#8F8599', line: '#342B3E', accent: '#F2A65A', accentText: '#1A1208', accentSoft: '#3A2A1C', accentInk: '#FFC88F', now: '#FF7A90' },
  Sunrise: { blurb: 'Peach and terracotta mornings', dark: false, bg: '#FBF4EC', surface: '#FFFDFA', sunken: '#F6ECE1', text: '#2B1E16', muted: '#75604F', faint: '#9A8573', line: '#EEDFD0', accent: '#C2410C', accentText: '#FFFFFF', accentSoft: '#FDE6D6', accentInk: '#9A330A', now: '#C2255C' },
};

export const THEME_NAMES = Object.keys(THEMES) as ThemeName[];

type CatColors = Record<CategoryId, { bg: string; fg: string; dot: string }>;

const CAT_LIGHT: Omit<CatColors, 'break'> = {
  deep: { bg: '#E4EAFE', fg: '#233A9E', dot: '#3B5BDB' },
  meet: { bg: '#EFE7FE', fg: '#55309C', dot: '#7950F2' },
  health: { bg: '#DDF2E4', fg: '#1E6640', dot: '#2F9E44' },
  personal: { bg: '#FFE9D6', fg: '#8F430B', dot: '#E8590C' },
  admin: { bg: '#E8EBEE', fg: '#39424C', dot: '#748291' },
};

const CAT_DARK: Omit<CatColors, 'break'> = {
  deep: { bg: '#1D2850', fg: '#C3D1FF', dot: '#7C9CFF' },
  meet: { bg: '#2B2050', fg: '#DCCBFF', dot: '#A98BFF' },
  health: { bg: '#153826', fg: '#AEE9C6', dot: '#4CC38A' },
  personal: { bg: '#42261A', fg: '#FFD3B3', dot: '#F59E5B' },
  admin: { bg: '#252B34', fg: '#CDD4DC', dot: '#8C99A8' },
};

export function resolveTheme(setting: ThemeSetting, prefersDark: boolean): ThemeName {
  if (setting === 'auto') return prefersDark ? 'Midnight' : 'Paper';
  return setting;
}

/** Writes the theme's tokens as CSS custom properties on <html>. */
export function applyTheme(name: ThemeName): void {
  const t = THEMES[name];
  const root = document.documentElement;
  const set = (k: string, v: string) => root.style.setProperty(k, v);
  set('--bg', t.bg);
  set('--surface', t.surface);
  set('--sunken', t.sunken);
  set('--text', t.text);
  set('--muted', t.muted);
  set('--faint', t.faint);
  set('--line', t.line);
  set('--accent', t.accent);
  set('--accent-text', t.accentText);
  set('--accent-soft', t.accentSoft);
  set('--accent-ink', t.accentInk);
  set('--now', t.now);
  set('--shadow', t.dark ? '0 12px 32px rgba(0,0,0,.45)' : '0 12px 32px rgba(28,27,25,.12)');
  const cats = t.dark ? CAT_DARK : CAT_LIGHT;
  for (const [k, c] of Object.entries(cats)) {
    set(`--c-${k}-bg`, c.bg);
    set(`--c-${k}-fg`, c.fg);
    set(`--c-${k}-dot`, c.dot);
  }
  set('--c-break-bg', t.sunken);
  set('--c-break-fg', t.muted);
  set('--c-break-dot', t.faint);
  root.style.colorScheme = t.dark ? 'dark' : 'light';
  root.dataset.theme = name;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t.bg);
}
