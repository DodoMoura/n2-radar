const nf = new Intl.NumberFormat("pt-BR");
const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const df = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const dtf = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const dsf = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const mf = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" });

export const fmtNum = (n) => (n == null ? "—" : nf.format(n));
export const fmtNum1 = (n) => (n == null ? "—" : nf1.format(n));
export const fmtPct = (r, casas = 0) =>
  r == null || !isFinite(r) ? "—" : (r * 100).toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas }) + "%";

export function fmtDur(ms, curto = false) {
  if (ms == null || !isFinite(ms)) return "—";
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = min / 60;
  if (h < 48) {
    const hh = Math.floor(h), mm = min % 60;
    return curto || !mm ? `${hh}h` : `${hh}h ${String(mm).padStart(2, "0")}`;
  }
  return `${nf1.format(h / 24)} d`;
}
export const fmtMin = (m) => (m == null ? "—" : fmtDur(m * 60000));
export const fmtH = (ms) => (ms == null ? "—" : nf1.format(ms / 3600e3) + " h");
export const fmtDate = (t) => (t ? df.format(t) : "—");
export const fmtDateTime = (t) => (t ? dtf.format(t) : "—");
export const fmtDayShort = (t) => dsf.format(t).replace(".", "");
export const fmtMonth = (t) => mf.format(t).replace(".", "");

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function toLocalInput(t) {
  if (!t) return "";
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function toDateInput(t) {
  return toLocalInput(t).slice(0, 10);
}
