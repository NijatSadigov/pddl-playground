// Sharing & persistence: encode the current domain/problem into a URL hash,
// restore from it, auto-save to localStorage, and download files.

import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string';

export interface SharedState {
  domain: string;
  problem: string;
  preset?: string;
}

const LS_KEY = 'pddl-playground:last';

export function buildShareHash(s: SharedState): string {
  return '#s=' + compressToEncodedURIComponent(JSON.stringify(s));
}

export function buildShareUrl(s: SharedState): string {
  return location.origin + location.pathname + buildShareHash(s);
}

function decode(code: string): SharedState | null {
  try {
    const json = decompressFromEncodedURIComponent(code);
    if (!json) return null;
    const obj = JSON.parse(json);
    if (obj && typeof obj.domain === 'string' && typeof obj.problem === 'string')
      return obj as SharedState;
  } catch {
    /* ignore malformed links */
  }
  return null;
}

export function readShareFromHash(): SharedState | null {
  const m = location.hash.match(/[#&]s=([^&]+)/);
  return m ? decode(m[1]) : null;
}

export function clearShareHash(): void {
  if (location.hash.includes('s='))
    history.replaceState(null, '', location.pathname + location.search);
}

export function saveLast(s: { domain: string; problem: string }): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* storage may be unavailable (private mode) */
  }
}

export function loadLast(): { domain: string; problem: string } | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj && typeof obj.domain === 'string' && typeof obj.problem === 'string')
      return obj;
  } catch {
    /* ignore */
  }
  return null;
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
