import type { AudioSegment, VideoSegment } from "./renderplan.js";

/** Zahlen in Filterketten kurz und ohne Flieszkomma-Rauschen ausgeben. */
const round = (n: number): string => String(Number(n.toFixed(3)));

/**
 * Filtergraph fuer einen Bildblock: Bereiche schneiden, zusammenfuegen,
 * bei Bedarf verlangsamen und den letzten Frame halten.
 * Ausgang ist immer das Label [vout].
 */
export function segmentFilter(segment: VideoSegment, fps: number): string {
  if (segment.kind === "take" && segment.ranges.length === 0) {
    throw new Error(`Block ${segment.blockId} hat keinen verbleibenden Bildbereich.`);
  }

  const parts: string[] = [];
  const labels: string[] = [];

  segment.ranges.forEach(([from, to], index) => {
    const label = `t${index}`;
    parts.push(`[0:v]trim=start=${round(from)}:end=${round(to)},setpts=PTS-STARTPTS[${label}]`);
    labels.push(`[${label}]`);
  });

  let current = labels[0] ?? "[0:v]";
  if (labels.length > 1) {
    parts.push(`${labels.join("")}concat=n=${labels.length}:v=1:a=0[vc]`);
    current = "[vc]";
  }

  const tail: string[] = [];
  if (Math.abs(segment.speed - 1) > 0.001) tail.push(`setpts=PTS/${round(segment.speed)}`);
  if (segment.freeze > 0.001) {
    tail.push(`tpad=stop_mode=clone:stop_duration=${round(segment.freeze)}`);
  }
  tail.push(`fps=${round(fps)}`);

  parts.push(`${current}${tail.join(",")}[vout]`);
  return parts.join(";");
}

/**
 * Filtergraph fuer die Sprachspur: jeder Block wird auf Stimme plus Pause
 * gebracht, danach werden alle Bloecke aneinandergereiht. Ausgang ist [voraw].
 */
export function voiceFilter(segments: AudioSegment[]): string {
  if (segments.length === 0) throw new Error("Die Sprachspur enthaelt kein Block-Audio.");

  const parts: string[] = [];
  const labels: string[] = [];

  segments.forEach((segment, index) => {
    const label = `a${index}`;
    // Jeder Block wird auf genau seine Zieldauer gebracht: Stimme plus Pause.
    // Ohne das summieren sich die Ungenauigkeiten der einzelnen Tondateien auf,
    // und die Stimme laeuft dem Bild ueber die Blockfolge hinweg davon.
    const whole = round(segment.duration + segment.pauseAfter);
    parts.push(
      `[${index}:a]atrim=end=${whole},asetpts=PTS-STARTPTS,apad=whole_dur=${whole}[${label}]`,
    );
    labels.push(`[${label}]`);
  });

  if (labels.length === 1) {
    parts.push(`${labels[0]}anull[voraw]`);
  } else {
    parts.push(`${labels.join("")}concat=n=${labels.length}:v=0:a=1[voraw]`);
  }
  return parts.join(";");
}

/**
 * Mischt Musik unter die Sprache. Eingang 0 ist die Sprachspur, Eingang 1 die Musik.
 * Die Musik wird abgesenkt und, wenn duckDb ungleich 0 ist, zusaetzlich gegen die
 * Sprache geduckt. Bei duckDb 0 laeuft sie unveraendert durch.
 */
export function musicMixFilter(
  opts: { gainDb: number; duckDb: number; masterLufs: number },
): string {
  const master = `[mixed]loudnorm=I=${round(opts.masterLufs)}:TP=-1.5:LRA=11[aout]`;
  const music = `[1:a]volume=${round(opts.gainDb)}dB[music]`;

  if (opts.duckDb === 0) {
    return [
      music,
      "[0:a][music]amix=inputs=2:duration=first:normalize=0[mixed]",
      master,
    ].join(";");
  }

  const ratio = Math.max(2, Math.round(Math.abs(opts.duckDb) * 0.7));
  return [
    music,
    "[0:a]asplit=2[vo1][vo2]",
    `[music][vo1]sidechaincompress=threshold=0.03:ratio=${ratio}:attack=20:release=400[ducked]`,
    "[vo2][ducked]amix=inputs=2:duration=first:normalize=0[mixed]",
    master,
  ].join(";");
}

/** Blendet zwischen Hauptvideo (Eingang 0) und Outro (Eingang 1) ueber. */
export function outroFilter(mainDuration: number, crossfade: number): string {
  const offset = Math.max(0, mainDuration - crossfade);
  return [
    `[0:v][1:v]xfade=transition=fade:duration=${round(crossfade)}:offset=${round(offset)}[v]`,
    `[0:a][1:a]acrossfade=d=${round(crossfade)}[a]`,
  ].join(";");
}

/** Eine Zeile fuer die concat-Liste. ffmpeg erwartet Schraegstriche und maskierte Apostrophe. */
export function concatListLine(absolutePath: string): string {
  const normalised = absolutePath.replace(/\\/g, "/").replace(/'/g, "'\\''");
  return `file '${normalised}'`;
}

/**
 * Einen Pfad als Argument einer Filterkette maskieren: Schraegstriche statt
 * Backslashes, der Doppelpunkt der Laufwerksangabe als `\:`, das Ganze in
 * einfachen Anfuehrungszeichen (der erprobte Weg aus der VideoPipeline).
 */
export function filterPath(absolutePath: string): string {
  const normalised = absolutePath
    .replace(/\\/g, "/")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:");
  return `'${normalised}'`;
}
