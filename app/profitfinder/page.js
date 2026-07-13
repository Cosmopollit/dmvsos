'use client';

import React, { useState, useMemo } from "react";

/* ────────────────────────────────────────────────────────────
   FREIGHT LEDGER - a trip-sheet / dispatch-log aesthetic.
   Paper (manila), ink graphite, dispatch green, cinnabar red.
   Mono odometer numerals, ruled rows, stamped totals.
   ──────────────────────────────────────────────────────────── */

const C = {
  paper: "#EDE7D8",
  paperEdge: "#E3DBC8",
  card: "#F5F1E6",
  rule: "#B9AE94",
  ruleSoft: "#D3C9B2",
  ink: "#22201C",
  inkSoft: "#6B6552",
  green: "#1F6E43",
  greenPaper: "#E1EBDD",
  red: "#C1352A",
  redPaper: "#F0DEDA",
  stampBlue: "#2A4D69",
  slices: ["#22201C", "#1F6E43", "#2A4D69", "#B5762A", "#7A5230", "#8A8570", "#5C6E4A", "#A03A2E"],
};

const MONO = "'JetBrains Mono', 'SF Mono', ui-monospace, 'Roboto Mono', monospace";
const SANS = "'Inter', system-ui, -apple-system, sans-serif";

const money = (n) =>
  (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);

function Field({ label, hint, value, onChange, prefix, suffix }) {
  return (
    <label style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: `1px solid ${C.ruleSoft}` }}>
      <span style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>
        {label}
        {hint && <span style={{ color: C.inkSoft, fontSize: 11, marginLeft: 6 }}>{hint}</span>}
      </span>
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 3, fontFamily: MONO }}>
        {prefix && <span style={{ color: C.inkSoft, fontSize: 13 }}>{prefix}</span>}
        <input
          type="number"
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value === "" ? "" : parseFloat(e.target.value))}
          onFocus={(e) => e.target.select()}
          style={{
            width: 74, textAlign: "right", border: "none", borderBottom: `1.5px solid ${C.ink}`,
            outline: "none", background: "transparent", color: C.ink, fontSize: 15, fontWeight: 600,
            fontFamily: MONO, padding: "1px 2px",
          }}
        />
        {suffix && <span style={{ color: C.inkSoft, fontSize: 11, width: 42, textAlign: "left" }}>{suffix}</span>}
      </span>
    </label>
  );
}

function Toggle({ options, value, onChange }) {
  return (
    <div style={{ display: "inline-flex", border: `1.5px solid ${C.ink}` }}>
      {options.map((o, i) => {
        const active = o.val === value;
        return (
          <button
            key={o.val}
            onClick={() => onChange(o.val)}
            style={{
              border: "none", borderLeft: i ? `1.5px solid ${C.ink}` : "none", cursor: "pointer",
              padding: "6px 14px", fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
              textTransform: "uppercase", fontFamily: SANS,
              background: active ? C.ink : "transparent", color: active ? C.paper : C.ink,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SectionTitle({ n, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "20px 0 6px" }}>
      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.inkSoft }}>{n}</span>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: C.ink, textTransform: "uppercase" }}>{children}</span>
      <span style={{ flex: 1, height: 1.5, background: C.ink }} />
    </div>
  );
}

export default function TruckProfitCalculator() {
  const [period, setPeriod] = useState("week");
  const [mileMode, setMileMode] = useState("all");

  const [rate, setRate] = useState(2.30);
  const [milesPerWeek, setMilesPerWeek] = useState(4000);
  const [deadhead, setDeadhead] = useState(10);
  const [mpg, setMpg] = useState(7);
  const [fuelPrice, setFuelPrice] = useState(4.0);

  const [driverPct, setDriverPct] = useState(30);
  const [dispatchPct, setDispatchPct] = useState(5);
  const [factoringPct, setFactoringPct] = useState(0);

  const [maintMonthly, setMaintMonthly] = useState(2600);
  const [tiresMonthly, setTiresMonthly] = useState(700);
  const [iftaPerMile, setIftaPerMile] = useState(0.02);
  const [tollsMonthly, setTollsMonthly] = useState(350);

  const [truckPayment, setTruckPayment] = useState(0);
  const [trailerPayment, setTrailerPayment] = useState(0);
  const [insurance, setInsurance] = useState(1200);
  const [parking, setParking] = useState(250);
  const [eld, setEld] = useState(45);
  const [permits, setPermits] = useState(150);
  const [misc, setMisc] = useState(100);

  const [afterTax, setAfterTax] = useState(false);
  const [taxesMonthly, setTaxesMonthly] = useState(2000);

  const num = (v) => (v === "" || isNaN(v) ? 0 : v);
  const W2M = 4.333;

  const calc = useMemo(() => {
    const mult = period === "week" ? 1 : W2M;
    const totalMiles = num(milesPerWeek) * mult;
    const paidMiles = mileMode === "all" ? totalMiles : totalMiles * (1 - num(deadhead) / 100);
    const gross = paidMiles * num(rate);

    const fuel = mpg > 0 ? (totalMiles / num(mpg)) * num(fuelPrice) : 0;
    const ifta = totalMiles * num(iftaPerMile);

    const driver = gross * (num(driverPct) / 100);
    const dispatch = gross * (num(dispatchPct) / 100);
    const factoring = gross * (num(factoringPct) / 100);

    const fixMult = period === "week" ? 1 / W2M : 1;
    const tolls = num(tollsMonthly) * fixMult;
    const maint = num(maintMonthly) * fixMult;
    const tires = num(tiresMonthly) * fixMult;
    const truck = num(truckPayment) * fixMult;
    const trailer = num(trailerPayment) * fixMult;
    const ins = num(insurance) * fixMult;
    const park = num(parking) * fixMult;
    const eldC = num(eld) * fixMult;
    const perm = num(permits) * fixMult;
    const miscC = num(misc) * fixMult;

    const rows = [
      { k: "Топливо", v: fuel },
      { k: "Зарплата драйвера", v: driver },
      { k: "Ремонт/обслуживание", v: maint },
      { k: "Шины", v: tires },
      { k: "Диспетчер", v: dispatch },
      { k: "Factoring", v: factoring },
      { k: "IFTA/налоги", v: ifta },
      { k: "Толлы", v: tolls },
      { k: "Платёж за трак", v: truck },
      { k: "Платёж за трейлер", v: trailer },
      { k: "Страховка", v: ins },
      { k: "Парковка", v: park },
      { k: "ELD", v: eldC },
      { k: "Пермиты/IRP", v: perm },
      { k: "Прочее", v: miscC },
    ].filter((r) => r.v > 0);

    const totalExpense = rows.reduce((s, r) => s + r.v, 0);
    const net = gross - totalExpense;
    const taxes = afterTax ? num(taxesMonthly) * fixMult : 0;
    const netAfterTax = net - taxes;
    const shown = afterTax ? netAfterTax : net;
    const perMile = totalMiles > 0 ? shown / totalMiles : 0;
    const margin = gross > 0 ? (shown / gross) * 100 : 0;
    return { totalMiles, paidMiles, gross, rows, totalExpense, net, taxes, netAfterTax, shown, perMile, margin };
  }, [period, mileMode, rate, milesPerWeek, deadhead, mpg, fuelPrice, driverPct, dispatchPct, factoringPct, maintMonthly, tiresMonthly, iftaPerMile, tollsMonthly, truckPayment, trailerPayment, insurance, parking, eld, permits, misc, afterTax, taxesMonthly]);

  const bars = useMemo(() => {
    const total = calc.totalExpense || 1;
    return calc.rows
      .map((row, i) => ({ ...row, color: C.slices[i % C.slices.length], pct: (row.v / total) * 100 }))
      .sort((a, b) => b.v - a.v);
  }, [calc]);

  const per = period === "week" ? "нед." : "мес.";
  const profitable = calc.shown >= 0;
  const displayMiles = period === "week" ? milesPerWeek : Math.round(num(milesPerWeek) * W2M);

  return (
    <div style={{ fontFamily: SANS, background: C.paper, color: C.ink, minHeight: "100vh", padding: "clamp(12px,3vw,26px)", backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 27px, ${C.paperEdge} 27px, ${C.paperEdge} 28px)` }}>
      <div style={{ maxWidth: 1060, margin: "0 auto", background: C.card, border: `2px solid ${C.ink}`, boxShadow: `6px 6px 0 ${C.rule}` }}>

        {/* Masthead */}
        <div style={{ borderBottom: `2px solid ${C.ink}`, padding: "16px 22px", display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.paper, background: C.ink, padding: "2px 7px", letterSpacing: 1 }}>PROFIT FINDER</span>
            </div>
            <h1 style={{ margin: "6px 0 0", fontSize: "clamp(22px,3.6vw,30px)", fontWeight: 800, letterSpacing: -0.4 }}>
              Расчёт прибыли трака
            </h1>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Toggle options={[{ val: "week", label: "Неделя" }, { val: "month", label: "Месяц" }]} value={period} onChange={setPeriod} />
            <Toggle options={[{ val: "all", label: "Все мили" }, { val: "loaded", label: "Гружёные" }]} value={mileMode} onChange={setMileMode} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))" }}>

          {/* LEFT: inputs */}
          <div style={{ padding: "6px 22px 22px", borderRight: `2px solid ${C.ink}` }}>
            <SectionTitle n="01">Доход</SectionTitle>
            <Field label="Ставка" hint="за милю" prefix="$" value={rate} onChange={setRate} suffix="/ми" />
            <Field
              label="Пробег"
              hint={period === "week" ? "в неделю" : "в месяц"}
              value={displayMiles}
              onChange={(v) => setMilesPerWeek(period === "week" ? v : (v === "" ? "" : v / W2M))}
              suffix={period === "week" ? "ми/нед" : "ми/мес"}
            />
            {mileMode === "loaded" && (
              <Field label="Deadhead" hint="пустой пробег" value={deadhead} onChange={setDeadhead} suffix="%" />
            )}

            <SectionTitle n="02">Топливо</SectionTitle>
            <Field label="Расход" hint="миль на галлон" value={mpg} onChange={setMpg} suffix="MPG" />
            <Field label="Цена топлива" prefix="$" value={fuelPrice} onChange={setFuelPrice} suffix="/гал" />

            <SectionTitle n="03">Проценты от Gross</SectionTitle>
            <Field label="Зарплата драйвера" value={driverPct} onChange={setDriverPct} suffix="%" />
            <Field label="Диспетчер" value={dispatchPct} onChange={setDispatchPct} suffix="%" />
            <Field label="Factoring" hint="0 если нет" value={factoringPct} onChange={setFactoringPct} suffix="%" />

            <SectionTitle n="04">Переменные ($/милю)</SectionTitle>
            <Field label="IFTA/налоги" prefix="$" value={iftaPerMile} onChange={setIftaPerMile} suffix="/ми" />

            <SectionTitle n="05">Фиксированные ($/месяц)</SectionTitle>
            <Field label="Толлы" prefix="$" value={tollsMonthly} onChange={setTollsMonthly} suffix="/мес" />
            <Field label="Ремонт/обслуживание" prefix="$" value={maintMonthly} onChange={setMaintMonthly} suffix="/мес" />
            <Field label="Шины" prefix="$" value={tiresMonthly} onChange={setTiresMonthly} suffix="/мес" />
            <Field label="Платёж за трак" prefix="$" value={truckPayment} onChange={setTruckPayment} suffix="/мес" />
            <Field label="Платёж за трейлер" prefix="$" value={trailerPayment} onChange={setTrailerPayment} suffix="/мес" />
            <Field label="Страховка" prefix="$" value={insurance} onChange={setInsurance} suffix="/мес" />
            <Field label="Парковка" prefix="$" value={parking} onChange={setParking} suffix="/мес" />
            <Field label="ELD" prefix="$" value={eld} onChange={setEld} suffix="/мес" />
            <Field label="Пермиты/IRP" prefix="$" value={permits} onChange={setPermits} suffix="/мес" />
            <Field label="Прочее" prefix="$" value={misc} onChange={setMisc} suffix="/мес" />
          </div>

          {/* RIGHT: tally */}
          <div style={{ padding: "18px 22px 22px", display: "flex", flexDirection: "column", gap: 16 }}>

            <div style={{ border: `2.5px solid ${profitable ? C.green : C.red}`, background: profitable ? C.greenPaper : C.redPaper, padding: "14px 18px", position: "relative" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: profitable ? C.green : C.red }}>
                  {afterTax ? "На руки после налогов" : (profitable ? "Прибыль" : "Убыток")} / {per}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.inkSoft, border: `1px solid ${C.inkSoft}`, padding: "1px 6px" }}>
                  {profitable ? "OK" : "STOP"}
                </span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: "clamp(34px,6.5vw,50px)", fontWeight: 700, lineHeight: 1.02, marginTop: 4, color: profitable ? C.green : C.red, letterSpacing: -1 }}>
                {money(calc.shown)}
              </div>
              {afterTax && (
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 12, marginTop: 6, paddingTop: 6, borderTop: `1px dashed ${profitable ? C.green : C.red}`, color: C.inkSoft }}>
                  <span style={{ fontFamily: SANS }}>Прибыль до налогов: <b style={{ color: C.ink, fontFamily: MONO }}>{money(calc.net)}</b></span>
                  <span style={{ fontFamily: SANS }}>Налоги: <b style={{ color: C.red, fontFamily: MONO }}>{"-"}{money(calc.taxes)}</b></span>
                </div>
              )}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8, fontSize: 12.5, fontFamily: MONO }}>
                <span><b style={{ color: C.ink }}>{money2(calc.perMile)}</b> <span style={{ color: C.inkSoft, fontFamily: SANS }}>/миля</span></span>
                <span><b style={{ color: C.ink }}>{calc.margin.toFixed(1)}%</b> <span style={{ color: C.inkSoft, fontFamily: SANS }}>маржа</span></span>
                <span><b style={{ color: C.ink }}>{Math.round(calc.totalMiles).toLocaleString()}</b> <span style={{ color: C.inkSoft, fontFamily: SANS }}>миль</span></span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ border: `1.5px solid ${C.ink}`, padding: "10px 14px" }}>
                <div style={{ fontSize: 10.5, color: C.inkSoft, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase" }}>Gross</div>
                <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: C.ink, marginTop: 2 }}>{money(calc.gross)}</div>
              </div>
              <div style={{ border: `1.5px solid ${C.ink}`, padding: "10px 14px" }}>
                <div style={{ fontSize: 10.5, color: C.inkSoft, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase" }}>Расходы</div>
                <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: C.red, marginTop: 2 }}>{money(calc.totalExpense)}</div>
              </div>
            </div>

            <div style={{ border: `1.5px solid ${C.ink}`, padding: "12px 14px", background: afterTax ? C.card : "transparent" }}>
              <div
                role="checkbox"
                aria-checked={afterTax}
                tabIndex={0}
                onClick={() => setAfterTax((v) => !v)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAfterTax((v) => !v); } }}
                style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}
              >
                <span style={{ width: 18, height: 18, border: `2px solid ${C.ink}`, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: afterTax ? C.ink : "transparent" }}>
                  {afterTax && <span style={{ color: C.paper, fontSize: 13, fontWeight: 800, lineHeight: 1 }}>{"✓"}</span>}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Считать чистую прибыль после налогов</span>
              </div>
              {afterTax && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.ruleSoft}` }}>
                  <Field label="Налоги, всего" hint="все налоги/сборы" prefix="$" value={taxesMonthly} onChange={setTaxesMonthly} suffix="/мес" />
                  <div style={{ fontSize: 11, color: C.inkSoft, lineHeight: 1.5, marginTop: 4 }}>
                    Одна сумма всех налогов и сборов за месяц (федеральный, self-employment, штат и т.д.). Делится на {W2M.toFixed(2)} в режиме «Неделя».
                  </div>
                </div>
              )}
            </div>

            <div style={{ border: `1.5px solid ${C.ink}`, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>Разбивка расходов</div>

              <div style={{ display: "flex", height: 26, border: `1.5px solid ${C.ink}`, overflow: "hidden", marginBottom: 14 }}>
                {bars.map((b, i) => (
                  <div key={b.k} title={`${b.k} · ${b.pct.toFixed(0)}%`} style={{ width: `${b.pct}%`, background: b.color, borderRight: i < bars.length - 1 ? `1px solid ${C.card}` : "none" }} />
                ))}
              </div>

              <div>
                {bars.map((b) => (
                  <div key={b.k} style={{ display: "flex", alignItems: "center", gap: 9, padding: "4px 0", fontSize: 12.5, borderBottom: `1px solid ${C.ruleSoft}` }}>
                    <span style={{ width: 11, height: 11, background: b.color, flexShrink: 0, border: `1px solid ${C.ink}` }} />
                    <span style={{ flex: 1, color: C.ink }}>{b.k}</span>
                    <span style={{ fontFamily: MONO, color: C.inkSoft, minWidth: 34, textAlign: "right" }}>{b.pct.toFixed(0)}%</span>
                    <span style={{ fontFamily: MONO, color: C.ink, fontWeight: 700, minWidth: 70, textAlign: "right" }}>{money(b.v)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, marginTop: 4, borderTop: `2px solid ${C.ink}` }}>
                  <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase" }}>Итого расходов</span>
                  <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: C.red }}>{money(calc.totalExpense)}</span>
                </div>
              </div>
            </div>

            <div style={{ fontSize: 11.5, color: C.inkSoft, lineHeight: 1.6 }}>
              Поле «Пробег» показывает мили за выбранный период. Переключи Неделя/Месяц, пересчитается автоматически. Топливо, ремонт, шины, IFTA и толлы считаются по всем милям. В режиме «Гружёные» ставка идёт только на оплачиваемые мили (за вычетом deadhead), а топливо и износ на весь пробег. Фиксированные суммы вводятся за месяц и делятся на {W2M.toFixed(2)} для недели.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
