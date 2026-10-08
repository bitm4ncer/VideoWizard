import { describe, expect, it } from "vitest";
import { computeFit, MIN_SPEED, OVERFLOW_LIMIT, TAIL_GUARD } from "../src/lib/fit.js";
import type { Block } from "../src/lib/types.js";

/** Ein Block mit allen Pflichtfeldern; Abweichungen kommen ueber over. */
function block(over: Partial<Block> = {}): Block {
  return {
    id: "b001",
    kind: "take",
    source_id: "s01",
    source_in: 10,
    source_out: 20,
    silences: [],
    pause_after: 0,
    fit: "none",
    overlays: [],
    ...over,
  };
}

describe("computeFit trim", () => {
  it("schneidet zuerst die laengste Pause", () => {
    const r = computeFit(block({ silences: [[12, 12.5], [15, 17]] }), 8);
    expect(r.fit).toBe("trim");
    expect(r.ratio).toBeCloseTo(0.8, 3);
    expect(r.targetDuration).toBe(8);
    expect(r.cuts).toEqual([[15, 17]]);
    expect(r.effectiveOut).toBe(20);
    expect(r.speed).toBe(1);
    expect(r.freeze).toBe(0);
  });

  it("nimmt bei einem Teilschnitt das Ende der Pause", () => {
    // Der Sprecheinsatz bei 15 bleibt stehen, geschnitten wird ab 16.
    const r = computeFit(block({ silences: [[15, 17]] }), 9);
    expect(r.cuts).toEqual([[16, 17]]);
    expect(r.effectiveOut).toBe(20);
  });

  it("kuerzt hinten, wenn die Pausen nicht reichen", () => {
    const r = computeFit(block({ silences: [] }), 7);
    expect(r.fit).toBe("trim");
    expect(r.cuts).toEqual([]);
    expect(r.effectiveOut).toBeCloseTo(17, 3);
  });

  it("laesst die letzten 0,15 s unangetastet", () => {
    // Die Pause liegt komplett im geschuetzten Ende und entfaellt.
    const r = computeFit(block({ silences: [[19.9, 20]] }), 9);
    expect(r.cuts).toEqual([]);
    expect(r.effectiveOut).toBeCloseTo(19, 3);
  });

  it("tastet die letzten 0,15 s auch bei einem Teilschnitt nicht an", () => {
    const r = computeFit(block({ silences: [[17, 20]] }), 8.5);
    expect(r.cuts).toEqual([[18.35, 19.85]]);
    expect(r.effectiveOut).toBe(20);
  });

  it("verwirft Schnitte hinter dem gekuerzten Blockende", () => {
    // Die Stimme ist viel kuerzer als das Bild; das Blockende wandert vor
    // die Pause, der Schnitt entfaellt ersatzlos.
    const r = computeFit(block({ source_in: 0, source_out: 12, silences: [[9, 11.5]] }), 4);
    expect(r.fit).toBe("trim");
    expect(r.effectiveOut).toBeCloseTo(4, 3);
    expect(r.cuts).toEqual([]);
  });

  it("behaelt einen Schnitt vor dem gekuerzten Blockende", () => {
    const r = computeFit(block({ source_in: 0, source_out: 12, silences: [[3, 6]] }), 5);
    expect(r.cuts).toEqual([[3, 6]]);
    expect(r.effectiveOut).toBeCloseTo(8, 3);
  });

  it("beruecksichtigt pause_after in der Zieldauer", () => {
    const r = computeFit(block({ pause_after: 0.5 }), 7);
    expect(r.fit).toBe("trim");
    expect(r.targetDuration).toBe(7.5);
    expect(r.effectiveOut).toBeCloseTo(17.5, 3);
  });

  it("ignoriert Pausen unter 1 ms", () => {
    const r = computeFit(block({ silences: [[15, 15.0005]] }), 9);
    expect(r.cuts).toEqual([]);
    expect(r.effectiveOut).toBeCloseTo(19, 3);
  });

  it("klemmt Pausen auf den Blockbereich", () => {
    // Die Pause beginnt vor source_in; der Schnitt darf erst im Block wirken.
    const r = computeFit(block({ silences: [[8, 12]] }), 8.5);
    expect(r.cuts).toEqual([[10.5, 12]]);
    expect(r.effectiveOut).toBe(20);
  });
});

describe("computeFit hold", () => {
  it("verlangsamt das Bild, solange MIN_SPEED ausreicht", () => {
    const r = computeFit(block({ silences: [[12, 13]] }), 11);
    expect(r.fit).toBe("hold");
    expect(r.ratio).toBeCloseTo(1.1, 3);
    expect(r.speed).toBeCloseTo(10 / 11, 3);
    expect(r.freeze).toBeCloseTo(0, 3);
    expect(r.cuts).toEqual([]);
    expect(r.effectiveOut).toBe(20);
  });

  it("haelt den letzten Frame, wenn MIN_SPEED nicht ausreicht", () => {
    const r = computeFit(block(), 12);
    expect(r.fit).toBe("hold");
    expect(r.speed).toBe(0.9);
    expect(r.freeze).toBeCloseTo(12 - 10 / 0.9, 3);
  });

  it("gleich lange Bild- und Stimmdauer ist hold ohne Eingriff", () => {
    const r = computeFit(block(), 10);
    expect(r.fit).toBe("hold");
    expect(r.ratio).toBe(1);
    expect(r.speed).toBe(1);
    expect(r.freeze).toBe(0);
  });

  it("die Obergrenze 1,25 gilt noch als hold", () => {
    const r = computeFit(block(), 12.5);
    expect(r.fit).toBe("hold");
    expect(r.ratio).toBeCloseTo(1.25, 3);
    expect(r.speed).toBe(0.9);
    expect(r.freeze).toBeCloseTo(12.5 - 10 / 0.9, 3);
  });
});

describe("computeFit overflow", () => {
  it("meldet overflow ab mehr als 25 Prozent Ueberlaenge", () => {
    const r = computeFit(block({ silences: [[12, 13]] }), 12.6);
    expect(r.fit).toBe("overflow");
    expect(r.ratio).toBeCloseTo(1.26, 3);
    expect(r.cuts).toEqual([]);
    expect(r.effectiveOut).toBe(20);
    expect(r.speed).toBe(1);
    expect(r.freeze).toBe(0);
  });

  it("ohne Bildlaenge ist der Anteil unendlich", () => {
    const gleich = computeFit(block({ source_in: 10, source_out: 10 }), 5);
    expect(gleich.ratio).toBe(Number.POSITIVE_INFINITY);
    expect(gleich.fit).toBe("overflow");

    const negativ = computeFit(block({ source_in: 10, source_out: 9 }), 5);
    expect(negativ.ratio).toBe(Number.POSITIVE_INFINITY);
    expect(negativ.fit).toBe("overflow");
  });
});

describe("computeFit none", () => {
  it("still folgt immer der Stimme", () => {
    const b = block({ kind: "still", freeze_at: 12, pause_after: 0.35 });
    const r = computeFit(b, 6);
    expect(r.fit).toBe("none");
    expect(r.ratio).toBe(1);
    expect(r.targetDuration).toBeCloseTo(6.35, 3);
    expect(r.cuts).toEqual([]);
    expect(r.effectiveOut).toBe(20);
    expect(r.speed).toBe(1);
    expect(r.freeze).toBe(0);
  });
});

describe("die Konstanten", () => {
  it("TAIL_GUARD, MIN_SPEED und OVERFLOW_LIMIT stehen fest", () => {
    expect(TAIL_GUARD).toBe(0.15);
    expect(MIN_SPEED).toBe(0.9);
    expect(OVERFLOW_LIMIT).toBe(1.25);
  });
});
