import { describe, expect, it } from "vitest";
import {
  concatListLine, musicMixFilter, outroFilter, segmentFilter, voiceFilter,
} from "../src/lib/ffargs.js";
import type { AudioSegment, VideoSegment } from "../src/lib/renderplan.js";

/** Ein Bildabschnitt mit allen Pflichtfeldern; Abweichungen kommen ueber over. */
function segment(over: Partial<VideoSegment> = {}): VideoSegment {
  return {
    blockId: "b001",
    kind: "take",
    sourceFile: "sources/s01/raw.mp4",
    ranges: [[0, 3], [5, 10]],
    freezeAt: null,
    speed: 1,
    freeze: 0,
    duration: 8,
    ...over,
  };
}

/** Ein Tonabschnitt mit allen Pflichtfeldern. */
function audio(blockId: string, pause: number): AudioSegment {
  return { blockId, file: `audio/tts/${blockId}.wav`, duration: 3, pauseAfter: pause };
}

describe("segmentFilter", () => {
  it("schneidet die Bereiche und fuegt sie zusammen", () => {
    const filter = segmentFilter(segment(), 30);

    expect(filter).toContain("[0:v]trim=start=0:end=3,setpts=PTS-STARTPTS[t0]");
    expect(filter).toContain("[0:v]trim=start=5:end=10,setpts=PTS-STARTPTS[t1]");
    expect(filter).toContain("[t0][t1]concat=n=2:v=1:a=0[vc]");
    expect(filter).toContain("fps=30[vout]");
  });

  it("laesst concat weg, wenn es nur einen Bereich gibt", () => {
    const filter = segmentFilter(segment({ ranges: [[0, 8]] }), 30);

    expect(filter).not.toContain("concat=");
    expect(filter).toContain("[t0]fps=30[vout]");
  });

  it("setzt setpts nur bei abweichendem Tempo", () => {
    expect(segmentFilter(segment(), 30)).not.toContain("setpts=PTS/");

    const langsam = segmentFilter(segment({ speed: 0.9 }), 30);
    expect(langsam).toContain("[vc]setpts=PTS/0.9,fps=30[vout]");
  });

  it("haengt tpad an, wenn eingefroren wird", () => {
    const filter = segmentFilter(segment({ freeze: 0.42 }), 30);

    expect(filter).toContain("[vc]tpad=stop_mode=clone:stop_duration=0.42,fps=30[vout]");
  });

  it("wirft bei einem take ohne verbleibenden Bereich", () => {
    expect(() => segmentFilter(segment({ ranges: [] }), 30)).toThrow(/b001/);
  });
});

describe("voiceFilter", () => {
  it("bringt jeden Block auf Stimme plus Pause und reiht sie aneinander", () => {
    const filter = voiceFilter([audio("b001", 0.35), audio("b002", 0)]);

    expect(filter).toContain("[0:a]atrim=end=3.35,asetpts=PTS-STARTPTS,apad=whole_dur=3.35[a0]");
    expect(filter).toContain("[1:a]atrim=end=3,asetpts=PTS-STARTPTS,apad=whole_dur=3[a1]");
    expect(filter).toContain("[a0][a1]concat=n=2:v=0:a=1[voraw]");
  });

  it("kommt mit einem einzigen Block aus", () => {
    const filter = voiceFilter([audio("b001", 0)]);

    expect(filter).not.toContain("concat=");
    expect(filter).toContain("[a0]anull[voraw]");
  });

  it("wirft bei leerer Liste", () => {
    expect(() => voiceFilter([])).toThrow(/kein Block/);
  });
});

describe("musicMixFilter", () => {
  it("senkt die Musik ab, duckt sie gegen die Stimme und normalisiert am Ende", () => {
    const filter = musicMixFilter({ gainDb: -22, duckDb: -12, masterLufs: -14 });

    expect(filter).toContain("[1:a]volume=-22dB[music]");
    expect(filter).toContain("[0:a]asplit=2[vo1][vo2]");
    expect(filter).toContain(
      "[music][vo1]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[ducked]",
    );
    expect(filter).toContain("[vo2][ducked]amix=inputs=2:duration=first:normalize=0[mixed]");
    expect(filter).toContain("loudnorm=I=-14:TP=-1.5:LRA=11[aout]");
  });

  it("laesst die Musik ohne Ducking unveraendert durchlaufen", () => {
    const filter = musicMixFilter({ gainDb: -18, duckDb: 0, masterLufs: -14 });

    expect(filter).not.toContain("sidechaincompress");
    expect(filter).not.toContain("asplit");
    expect(filter).toContain("[1:a]volume=-18dB[music]");
    expect(filter).toContain("[0:a][music]amix=inputs=2:duration=first:normalize=0[mixed]");
    expect(filter).toContain("loudnorm=I=-14:TP=-1.5:LRA=11[aout]");
  });
});

describe("outroFilter", () => {
  it("blendet an der richtigen Stelle ueber", () => {
    const filter = outroFilter(120, 0.5);

    expect(filter).toContain("xfade=transition=fade:duration=0.5:offset=119.5[v]");
    expect(filter).toContain("[0:a][1:a]acrossfade=d=0.5[a]");
  });

  it("haelt den Versatz bei sehr kurzem Material bei null", () => {
    expect(outroFilter(0.2, 0.5)).toContain("xfade=transition=fade:duration=0.5:offset=0[v]");
  });
});

describe("concatListLine", () => {
  it("maskiert Apostrophe und nutzt Schraegstriche", () => {
    expect(concatListLine("C:\\a b\\it's.mp4")).toBe("file 'C:/a b/it'\\''s.mp4'");
  });
});
