// Dark theme for the Q-EVAL frame (2026-10-03).
// The original stylesheet only has a light palette with several hundred fixed colors. Rather than
// editing it, the build reads the bundled CSS and writes, for every rule that sets a color, the same
// selector again with that color moved onto the site's dark palette, inside a
// `prefers-color-scheme: dark` block appended after the original. Light mode is byte-for-byte the
// original; dark mode follows the operating system like the rest of the site.

const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|(?<![\w-])(?:white|black)(?![\w-])/g;
const ROLE_BY_PROP = {
  color: "text", "accent-color": "keep",
  background: "bg", "background-color": "bg", "background-image": "bg", "box-shadow": "shadow",
  border: "border", "border-color": "border", "border-top": "border", "border-right": "border",
  "border-bottom": "border", "border-left": "border", "border-top-color": "border", "border-right-color": "border",
  "border-bottom-color": "border", "border-left-color": "border", outline: "border", "outline-color": "border",
  "--ink": "text", "--muted": "text", "--line": "border", "--bg": "page",
};

function parseColor(token) {
  const t = token.toLowerCase();
  if (t === "white") return [255, 255, 255, 1];
  if (t === "black") return [0, 0, 0, 1];
  if (t[0] === "#") {
    let h = t.slice(1);
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  const parts = t.slice(t.indexOf("(") + 1, -1).split(/[\s,/]+/).filter(Boolean);
  if (t.startsWith("rgb")) {
    const v = parts.map((p, i) => (p.endsWith("%") ? parseFloat(p) * (i < 3 ? 2.55 : 0.01) : parseFloat(p)));
    return [v[0], v[1], v[2], v[3] ?? 1];
  }
  return null; // hsl() is not used by the bundle; leave it unchanged
}

function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, c = max - min;
  let h = 0;
  if (c) h = max === r ? ((g - b) / c) % 6 : max === g ? (b - r) / c + 2 : (r - g) / c + 4;
  return { h: (h * 60 + 360) % 360, s: c ? c / (1 - Math.abs(2 * l - 1)) : 0, l, chroma: c };
}

function fromHsl(h, s, l, a = 1) {
  const k = (n) => (n + h / 30) % 12, f = (n) => l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  const [r, g, b] = [f(0), f(8), f(4)].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255));
  if (a < 1) return `rgba(${r},${g},${b},${+a.toFixed(3)})`;
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Grays have no hue of their own (0 = red); give them the navy hue of the site's dark palette.
const hueOf = (h, chroma) => (chroma < 0.01 ? 222 : h);
// Near-white backgrounds become the site's dark surfaces: white cards → --surface (#131c30),
// the light page background → --bg (#0a0f1c). Light tinted chips become a translucent tint of
// the same hue, like the site's dark status pills.
function mapBackground(c, page = false) {
  const { h, l, chroma } = toHsl(c);
  if (l >= 0.8 && chroma >= 0.04) return fromHsl(h, 0.75, 0.55, clamp(chroma * 2.5 + 0.06, 0.1, 0.28) * c[3]);
  if (l >= 0.88) {
    return fromHsl(hueOf(h, chroma), 0.43, page ? 0.07 : clamp(0.135 - (1 - l) * 2.5, 0.05, 0.135), c[3]);
  }
  if (l >= 0.5 && chroma < 0.12) return fromHsl(hueOf(h, chroma), 0.25, clamp(1 - l, 0.18, 0.45), c[3]);
  return null;
}
function mapText(c) {
  const { h, s, l, chroma } = toHsl(c);
  if (l >= 0.75) return null; // light text already sits on a colored or dark background
  if (chroma < 0.15) return fromHsl(hueOf(h, chroma), Math.min(s, 0.3), 0.4 + (1 - l) * 0.55, c[3]);
  return fromHsl(h, Math.min(s, 0.85), clamp(0.62 + l * 0.15, 0.62, 0.82), c[3]);
}
function mapBorder(c) {
  const { h, l, chroma } = toHsl(c);
  if (l >= 0.8) {
    if (chroma >= 0.06) return fromHsl(h, 0.7, 0.55, 0.38 * c[3]);
    return fromHsl(hueOf(h, chroma), 0.3, clamp(0.17 + (1 - l) * 0.9, 0.17, 0.3), c[3]);
  }
  if (l >= 0.5 && chroma < 0.12) return fromHsl(hueOf(h, chroma), 0.25, clamp(1 - l, 0.25, 0.45), c[3]);
  return null;
}
const MAPPERS = {
  text: mapText, bg: (c) => mapBackground(c), page: (c) => mapBackground(c, true), border: mapBorder,
  // White rings around dots and badges should match the dark surface; dark shadows stay.
  shadow: (c) => (toHsl(c).l >= 0.8 ? mapBackground(c) : null),
};

function mapValue(value, role) {
  const mapper = MAPPERS[role];
  if (!mapper) return value;
  // Colors inside url(...) (inline SVG icons) are left alone.
  return value.split(/(url\([^)]*\))/).map((part, i) => (i % 2 ? part : part.replace(COLOR, (token) => {
    const c = parseColor(token);
    return (c && mapper(c)) || token;
  }))).join("");
}

function splitDeclarations(body) {
  const out = [];
  let depth = 0, quote = "", start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) { if (ch === quote && body[i - 1] !== "\\") quote = ""; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === ";" && !depth) { out.push(body.slice(start, i)); start = i + 1; }
  }
  out.push(body.slice(start));
  return out.map((d) => d.trim()).filter(Boolean);
}

// Minimal parser for esbuild's minified output: rules and nested at-rule blocks.
function parseBlocks(css, from = 0) {
  const items = [];
  let i = from, start = from, quote = "";
  while (i < css.length) {
    const ch = css[i];
    if (quote) { if (ch === quote && css[i - 1] !== "\\") quote = ""; i++; continue; }
    if (ch === '"' || ch === "'") { quote = ch; i++; continue; }
    if (css.startsWith("/*", i)) { i = css.indexOf("*/", i + 2) + 2; start = i; continue; }
    if (ch === "{") {
      const prelude = css.slice(start, i).trim();
      if (prelude.startsWith("@")) {
        const inner = parseBlocks(css, i + 1);
        items.push({ prelude, children: inner.items });
        i = inner.end + 1;
      } else {
        const end = css.indexOf("}", i);
        items.push({ prelude, body: css.slice(i + 1, end) });
        i = end + 1;
      }
      start = i;
      continue;
    }
    if (ch === "}") return { items, end: i };
    if (ch === ";" && css.slice(start, i).trim().startsWith("@")) { start = i + 1; }
    i++;
  }
  return { items, end: i };
}

function darkRules(items) {
  let out = "";
  for (const item of items) {
    if (item.children) {
      // Only width conditions occur in the bundle; animations, fonts and print keep their colors.
      if (!/^@media\b/.test(item.prelude) || /\bprint\b/.test(item.prelude)) continue;
      const inner = darkRules(item.children);
      if (inner) out += `${item.prelude}{${inner}}`;
      continue;
    }
    // Every color declaration is repeated, changed or not: the dark block comes after the whole
    // original sheet, so repeating only the changed ones would let an early rule's override beat
    // a later rule that kept its color (e.g. a solid bar fill declared after a pale badge tint).
    const repeated = [];
    for (const declaration of splitDeclarations(item.body)) {
      const colon = declaration.indexOf(":");
      const prop = declaration.slice(0, colon).trim().toLowerCase();
      const role = ROLE_BY_PROP[prop];
      if (!role || role === "keep") continue;
      const value = declaration.slice(colon + 1);
      repeated.push(`${prop}:${mapValue(value, role).trim()}`);
    }
    if (repeated.length) out += `${item.prelude}{${repeated.join(";")}}`;
  }
  return out;
}

export function buildDarkTheme(css) {
  const rules = darkRules(parseBlocks(css).items);
  return `@media screen and (prefers-color-scheme:dark){:root{color-scheme:dark}${rules}}`;
}
