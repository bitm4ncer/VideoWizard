/**
 * Das Datum als JJJJ-MM-TT in lokaler Zeit. `toISOString` rechnet in UTC und
 * liefert kurz nach Mitternacht noch den Vortag; `sv-SE` formatiert von sich
 * aus in der Form JJJJ-MM-TT. `now` ist die feste Uhr fuer den Test.
 */
export function localIsoDate(now: Date = new Date()): string {
  return now.toLocaleDateString("sv-SE");
}
