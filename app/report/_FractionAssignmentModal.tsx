import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { DateInput, NumberInput } from "@/components/ui/Field";
import type { GainAndLossEvent } from "@/lib/etrade/etrade.types";
import { Modal } from "@/components/ui/Modal";
import { match } from "ts-pattern";
import { LoadingIndicator } from "@/components/ui/LoadingIndicator";
import { MessageBox } from "@/components/ui/MessageBox";
import {
  fractionFrIncomeFromResidency,
  validateAbroadPeriodsForUi,
  type AbroadInterval,
} from "@/lib/taxes/fr-residency-fraction";

interface FractionAssignmentModalProps {
  data: GainAndLossEvent[];
  showModal: boolean;
  setShowModal: (show: boolean) => void;
  confirm: (fractions: number[], isFrQualified: boolean[]) => void;
  state: "loading" | "error" | "ok";
}

const toKey = (e: GainAndLossEvent) =>
  `${e.symbol},${e.planType},${e.dateGranted},${e.dateAcquired}`;
const fromKey = (pair: string) => pair.split(",");

const sortByDates = (pairA: string, pairB: string) => {
  const [, , aGranted, aAcquired] = fromKey(pairA);
  const [, , bGranted, bAcquired] = fromKey(pairB);
  return (
    aAcquired.localeCompare(bAcquired) ||
    aGranted.localeCompare(bGranted) ||
    pairA.localeCompare(pairB)
  );
};

const newAbroadRow = () => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  start: "",
  end: "",
});

const isFrQualifiedFromEvents = (
  events: GainAndLossEvent[],
  qualifiedMap: Map<string, boolean>,
) =>
  events.map((e) => {
    const datePair = toKey(e);
    return qualifiedMap.get(datePair) ?? e.qualifiedIn !== "us";
  });

export const FractionAssignmentModal = ({
  data,
  showModal,
  setShowModal,
  confirm,
  state,
}: FractionAssignmentModalProps) => {
  const [abroadRows, setAbroadRows] = useState(
    () => [] as ReturnType<typeof newAbroadRow>[],
  );
  const [qualifiedMap, setQualifiedMap] = useState<Map<string, boolean>>(
    new Map<string, boolean>(),
  );
  const [customKeys, setCustomKeys] = useState(() => new Set<string>());
  const [customPctByKey, setCustomPctByKey] = useState(
    () => new Map<string, number>(),
  );

  useEffect(() => {
    setAbroadRows([]);
    setQualifiedMap(new Map<string, boolean>());
    setCustomKeys(new Set<string>());
    setCustomPctByKey(new Map<string, number>());
  }, [data]);

  const salesByDates = useMemo(() => Map.groupBy(data, toKey), [data]);

  const abroadIntervals: AbroadInterval[] = useMemo(
    () =>
      abroadRows
        .filter((r) => r.start && r.end)
        .map((r) => ({ start: r.start, end: r.end })),
    [abroadRows],
  );

  const abroadUiError = useMemo(
    () =>
      validateAbroadPeriodsForUi(
        abroadRows.map((r) => ({ start: r.start, end: r.end })),
      ),
    [abroadRows],
  );

  const hasStockOptions = useMemo(
    () => data.some((e) => e.planType === "SO"),
    [data],
  );

  const windowErrorByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const key of Array.from(salesByDates.keys())) {
      const events = salesByDates.get(key) ?? [];
      const head = events[0];
      if (!head) continue;
      const r = fractionFrIncomeFromResidency({
        dateGranted: head.dateGranted,
        dateAcquired: head.dateAcquired,
        abroad: [],
      });
      if (!r.ok) m.set(key, r.error);
    }
    return m;
  }, [salesByDates]);

  const computedPct = useCallback(
    (key: string) => {
      const events = salesByDates.get(key) ?? [];
      const head = events[0];
      if (!head) return null;
      const r = fractionFrIncomeFromResidency({
        dateGranted: head.dateGranted,
        dateAcquired: head.dateAcquired,
        abroad: abroadIntervals,
      });
      if (!r.ok) return null;
      return r.fraction * 100;
    },
    [salesByDates, abroadIntervals],
  );

  const canConfirm =
    state === "ok" &&
    !abroadUiError &&
    windowErrorByKey.size === 0 &&
    data.length > 0;

  const setCustomForKey = (key: string, useCustom: boolean) => {
    if (useCustom) {
      const base = computedPct(key);
      if (base === null) return;
      setCustomKeys((prev) => new Set(prev).add(key));
      setCustomPctByKey((prev) => new Map(prev).set(key, base));
    } else {
      setCustomKeys((prev) => {
        const n = new Set(prev);
        n.delete(key);
        return n;
      });
      setCustomPctByKey((prev) => {
        const n = new Map(prev);
        n.delete(key);
        return n;
      });
    }
  };

  const updateAbroadRow = (
    id: string,
    patch: Partial<{ start: string; end: string }>,
  ) => {
    setAbroadRows((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
    setCustomKeys(new Set());
    setCustomPctByKey(new Map());
  };

  const addAbroadRow = () => {
    setAbroadRows((rows) => [...rows, newAbroadRow()]);
    setCustomKeys(new Set());
    setCustomPctByKey(new Map());
  };

  const removeAbroadRow = (id: string) => {
    setAbroadRows((rows) => rows.filter((r) => r.id !== id));
    setCustomKeys(new Set());
    setCustomPctByKey(new Map());
  };

  return (
    <Modal show={showModal}>
      <div className="grid grid-cols-1 gap-4 max-w-5xl">
        <div className="flex justify-between">
          <div className="text-lg font-bold">
            Confirm the origin of your income
          </div>
          <Button
            onClick={() => setShowModal(false)}
            isBorderless
            icon={XMarkIcon}
          />
        </div>
        <div>
          Enter periods when you were <strong>outside France</strong>. Any other
          calendar day is treated as <strong>in France</strong> for this
          calculator. For each sale line, the % of French income is derived from
          those periods and the grant-to-acquisition window (see table below).
          You can optionally override the computed % on a row.
        </div>
        <MessageBox level="warning" title="Residence-based estimate">
          <p>
            The percentage is based on periods you mark as outside France; other
            days are treated as in France. This is a{" "}
            <strong>residence-based proxy</strong> and may differ from strict
            allocation of employment income by country of activity under French
            doctrine and tax treaties. You remain responsible for verifying the
            results.
          </p>
        </MessageBox>
        {hasStockOptions ? (
          <MessageBox level="info" title="Stock options and dates">
            <p>
              For stock options, French rules use a &quot;reference period&quot;
              that often ends when you fully vest the{" "}
              <strong>right to exercise</strong>. ETrade&apos;s acquisition date
              on a sold lot may be the <strong>exercise date</strong> instead.
              This tool uses grant date → acquisition date from your file as a
              practical proxy; confirm with your advisor if needed.
            </p>
          </MessageBox>
        ) : null}
        {match(state)
          .with("ok", () => (
            <>
              <div className="flex flex-col gap-2">
                <div className="font-semibold">Periods outside France</div>
                {abroadRows.length === 0 ? (
                  <div className="text-sm text-gray-600">
                    No periods added — 100% France is assumed for every line
                    unless you add dates below.
                  </div>
                ) : null}
                {abroadRows.map((row) => (
                  <div key={row.id} className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[10rem]">
                      <DateInput
                        value={row.start}
                        onChange={(start) => updateAbroadRow(row.id, { start })}
                        placeholder="Start"
                      />
                    </div>
                    <div className="min-w-[10rem]">
                      <DateInput
                        value={row.end}
                        onChange={(end) => updateAbroadRow(row.id, { end })}
                        placeholder="End"
                      />
                    </div>
                    <Button
                      label="Remove"
                      color="red"
                      onClick={() => removeAbroadRow(row.id)}
                    />
                  </div>
                ))}
                <div>
                  <Button label="Add period" onClick={addAbroadRow} />
                </div>
                {abroadUiError ? (
                  <MessageBox level="error" title="Abroad periods">
                    <p>{abroadUiError}</p>
                  </MessageBox>
                ) : null}
              </div>

              <div className="grid grid-cols-7 gap-x-2 gap-y-2 items-center text-sm">
                {[
                  "Ticker",
                  "Plan Type",
                  "Grant Date",
                  "Acquisition Date",
                  "Is Plan FR Qualified?",
                  "Override",
                  "% FR",
                ].map((h) => (
                  <div key={h} className="font-semibold">
                    {h}
                  </div>
                ))}
                {Array.from(salesByDates.keys())
                  .sort(sortByDates)
                  .map((datePair) => {
                    const [symbol, planType, granted, acquired] =
                      fromKey(datePair);
                    const events = salesByDates.get(datePair) ?? [];
                    const defaultIsFrQualified =
                      events[0]?.qualifiedIn !== "us";
                    const isFrQualified =
                      qualifiedMap.get(datePair) ?? defaultIsFrQualified;
                    const winErr = windowErrorByKey.get(datePair);
                    const computed = computedPct(datePair);
                    const isCustom = customKeys.has(datePair);
                    const displayPct = isCustom
                      ? customPctByKey.get(datePair) ?? computed ?? 100
                      : computed ?? 100;

                    return (
                      <Fragment key={datePair}>
                        <div>{symbol}</div>
                        <div>{planType}</div>
                        <div>{granted}</div>
                        <div>{acquired}</div>
                        <div className="flex w-full items-center pl-4">
                          <input
                            type="checkbox"
                            className="m-0 block h-3 w-3"
                            checked={isFrQualified}
                            onChange={() =>
                              setQualifiedMap(
                                new Map(
                                  qualifiedMap.set(datePair, !isFrQualified),
                                ),
                              )
                            }
                          />
                        </div>
                        <div className="flex items-center pl-2">
                          <input
                            type="checkbox"
                            className="m-0 block h-3 w-3"
                            title="Use custom %"
                            checked={isCustom}
                            onChange={(ev) =>
                              setCustomForKey(datePair, ev.target.checked)
                            }
                          />
                        </div>
                        <div className="min-w-0">
                          {winErr ? (
                            <span className="text-red-600 text-xs">
                              {winErr}
                            </span>
                          ) : (
                            <NumberInput
                              value={displayPct}
                              min={0}
                              max={100}
                              maxDecimals={2}
                              isReadOnly={!isCustom}
                              onChange={(value) => {
                                if (!Number.isFinite(value)) return;
                                setCustomPctByKey(
                                  new Map(customPctByKey).set(datePair, value),
                                );
                              }}
                            />
                          )}
                          {!isCustom && computed !== null ? (
                            <div className="text-xs text-gray-500">
                              computed
                            </div>
                          ) : null}
                        </div>
                      </Fragment>
                    );
                  })}
              </div>
              <div className="flex justify-end">
                <Button
                  color="green"
                  isDisabled={!canConfirm}
                  onClick={() => {
                    const fractions = data.map((e) => {
                      const key = toKey(e);
                      if (customKeys.has(key)) {
                        const v = customPctByKey.get(key);
                        if (v !== undefined && Number.isFinite(v)) {
                          return v / 100;
                        }
                      }
                      const head =
                        (salesByDates.get(key) ?? []).find(Boolean) ?? e;
                      const r = fractionFrIncomeFromResidency({
                        dateGranted: head.dateGranted,
                        dateAcquired: head.dateAcquired,
                        abroad: abroadIntervals,
                      });
                      if (!r.ok) return 1;
                      return r.fraction;
                    });
                    confirm(
                      fractions,
                      isFrQualifiedFromEvents(data, qualifiedMap),
                    );
                    setShowModal(false);
                  }}
                  label="Confirm"
                  icon={CheckIcon}
                />
              </div>
            </>
          ))
          .with("loading", () => (
            <div className="flex">
              <LoadingIndicator />
            </div>
          ))
          .with("error", () => (
            <MessageBox
              level="error"
              title="cannot generate report, please retry later"
            />
          ))
          .exhaustive()}
      </div>
    </Modal>
  );
};
