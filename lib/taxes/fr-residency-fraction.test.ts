import {
  clipIntervalToWindow,
  fractionFrIncomeFromResidency,
  inclusiveDayCount,
  mergeAbroadIntervals,
  validateAbroadPeriodsForUi,
} from "./fr-residency-fraction";

describe("inclusiveDayCount", () => {
  it("counts a single day", () => {
    expect(inclusiveDayCount("2022-01-01", "2022-01-01")).toBe(1);
  });

  it("counts inclusive range", () => {
    expect(inclusiveDayCount("2022-01-01", "2022-01-03")).toBe(3);
  });

  it("returns 0 when start after end", () => {
    expect(inclusiveDayCount("2022-01-04", "2022-01-01")).toBe(0);
  });
});

describe("mergeAbroadIntervals", () => {
  it("merges overlapping intervals", () => {
    expect(
      mergeAbroadIntervals([
        { start: "2022-01-01", end: "2022-01-10" },
        { start: "2022-01-05", end: "2022-01-15" },
      ]),
    ).toEqual([{ start: "2022-01-01", end: "2022-01-15" }]);
  });

  it("merges intervals that touch on the same day", () => {
    expect(
      mergeAbroadIntervals([
        { start: "2022-01-01", end: "2022-01-03" },
        { start: "2022-01-03", end: "2022-01-05" },
      ]),
    ).toEqual([{ start: "2022-01-01", end: "2022-01-05" }]);
  });

  it("does not merge adjacent non-overlapping intervals", () => {
    expect(
      mergeAbroadIntervals([
        { start: "2022-01-01", end: "2022-01-03" },
        { start: "2022-01-04", end: "2022-01-06" },
      ]),
    ).toEqual([
      { start: "2022-01-01", end: "2022-01-03" },
      { start: "2022-01-04", end: "2022-01-06" },
    ]);
  });

  it("drops invalid or empty rows", () => {
    expect(
      mergeAbroadIntervals([
        { start: "", end: "" },
        { start: "2022-01-02", end: "2022-01-01" },
        { start: "2022-06-01", end: "2022-06-02" },
      ]),
    ).toEqual([{ start: "2022-06-01", end: "2022-06-02" }]);
  });
});

describe("clipIntervalToWindow", () => {
  it("clips to window", () => {
    expect(
      clipIntervalToWindow(
        { start: "2021-01-01", end: "2024-01-01" },
        "2022-01-01",
        "2022-12-31",
      ),
    ).toEqual({ start: "2022-01-01", end: "2022-12-31" });
  });

  it("returns null when no overlap", () => {
    expect(
      clipIntervalToWindow(
        { start: "2020-01-01", end: "2020-06-01" },
        "2022-01-01",
        "2022-12-31",
      ),
    ).toBeNull();
  });
});

describe("fractionFrIncomeFromResidency", () => {
  it("returns 100% when no abroad intervals", () => {
    expect(
      fractionFrIncomeFromResidency({
        dateGranted: "2022-01-01",
        dateAcquired: "2022-03-09",
        abroad: [],
      }),
    ).toEqual({ ok: true, fraction: 1 });
  });

  it("returns 0% when entire window is abroad", () => {
    expect(
      fractionFrIncomeFromResidency({
        dateGranted: "2022-01-01",
        dateAcquired: "2022-01-10",
        abroad: [{ start: "2021-12-01", end: "2022-12-31" }],
      }),
    ).toEqual({ ok: true, fraction: 0 });
  });

  it("prorates partial overlap at boundaries", () => {
    // Window 2022-01-01 .. 2022-01-10 = 10 days; abroad 2022-01-08 .. 2022-01-12 clips to 3 days
    expect(
      fractionFrIncomeFromResidency({
        dateGranted: "2022-01-01",
        dateAcquired: "2022-01-10",
        abroad: [{ start: "2022-01-08", end: "2022-01-12" }],
      }),
    ).toEqual({ ok: true, fraction: 0.7 });
  });

  it("fails when acquisition is before grant", () => {
    expect(
      fractionFrIncomeFromResidency({
        dateGranted: "2022-06-01",
        dateAcquired: "2022-01-01",
        abroad: [],
      }),
    ).toMatchObject({ ok: false });
  });
});

describe("validateAbroadPeriodsForUi", () => {
  it("returns null when valid or empty", () => {
    expect(validateAbroadPeriodsForUi([])).toBeNull();
    expect(
      validateAbroadPeriodsForUi([{ start: "2022-01-01", end: "2022-01-02" }]),
    ).toBeNull();
  });

  it("rejects half-filled row", () => {
    expect(
      validateAbroadPeriodsForUi([{ start: "2022-01-01", end: "" }]),
    ).toEqual("Each abroad period must have both start and end dates");
  });
});
