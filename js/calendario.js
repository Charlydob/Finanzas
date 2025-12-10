(function () {
  if (typeof window === "undefined" || !window.FIN_GLOBAL) return;

  const { getCuentas, getRegistros } = window.FIN_GLOBAL;

  const $calModo   = document.getElementById("cal-modo");
  const $calMes    = document.getElementById("cal-mes");
  const $calAnio   = document.getElementById("cal-anio");
  const $calCuenta = document.getElementById("cal-cuenta");
  const $calGrid   = document.getElementById("cal-grid");

  const $tabCal = document.querySelector(".tab-calendario[data-tab='calendario']");

  if (!$calGrid) return;

  // ===== Utilidad formato =====
  function numberToEs(n) {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2
    }).format(Number.isFinite(n) ? n : 0);
  }

  function pctToEs(n) {
    return new Intl.NumberFormat("es-ES", {
      style: "percent",
      maximumFractionDigits: 2
    }).format(Number.isFinite(n) ? n : 0);
  }

  // ===== Helpers fecha =====
  function toYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const TODAY = new Date();
  const TODAY_STR = toYMD(TODAY);

  // ===== Registros ordenados =====
  function getSortedRegistros() {
    const regs = getRegistros() || [];
    return regs
      .filter(r => r && r.fecha)
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  }

  // ===== Series diarias (total o por cuenta) =====
  function computeDailySeries(cuenta) {
    const regs = getSortedRegistros();
    const map = new Map();
    if (!regs.length) return map;

    let prevVal = null;

    for (const r of regs) {
      const dateStr = r.fecha;
      let cur;

      if (cuenta) {
        const saldos = r.saldos || {};
        if (Number.isFinite(saldos[cuenta])) {
          cur = saldos[cuenta];
        } else if (prevVal != null) {
          cur = prevVal;
        } else {
          continue;
        }
      } else {
        if (!Number.isFinite(r.total)) continue;
        cur = r.total;
      }

      let diff = 0;
      let pct  = 0;
      if (prevVal != null) {
        diff = cur - prevVal;
        pct  = prevVal !== 0 ? (diff / prevVal) : 0;
      }
      prevVal = cur;

      map.set(dateStr, {
        date: dateStr,
        total: cur,
        diff,
        pct
      });
    }

    return map;
  }

  // ===== Series mensuales =====
  function computeMonthlySeries(cuenta) {
    const daily = computeDailySeries(cuenta);
    const byMonth = new Map();
    if (!daily.size) return [];

    daily.forEach((v, date) => {
      const key = date.slice(0, 7); // YYYY-MM
      let arr = byMonth.get(key);
      if (!arr) {
        arr = [];
        byMonth.set(key, arr);
      }
      arr.push({ ...v, date });
    });

    const series = [];
    byMonth.forEach((arr, key) => {
      arr.sort((a, b) => a.date.localeCompare(b.date));
      const first = arr[0];
      const last  = arr[arr.length - 1];

      const baseTotal = first.total - first.diff;
      const endTotal  = last.total;
      const diff      = endTotal - baseTotal;
      const pct       = baseTotal !== 0 ? (diff / baseTotal) : 0;

      series.push({ key, diff, pct, totalEnd: endTotal });
    });

    return series;
  }

  // ===== Series anuales =====
  function computeYearlySeries(cuenta) {
    const daily = computeDailySeries(cuenta);
    const byYear = new Map();
    if (!daily.size) return [];

    daily.forEach((v, date) => {
      const year = date.slice(0, 4);
      let arr = byYear.get(year);
      if (!arr) {
        arr = [];
        byYear.set(year, arr);
      }
      arr.push({ ...v, date });
    });

    const series = [];
    byYear.forEach((arr, year) => {
      arr.sort((a, b) => a.date.localeCompare(b.date));
      const first = arr[0];
      const last  = arr[arr.length - 1];

      const baseTotal = first.total - first.diff;
      const endTotal  = last.total;
      const diff      = endTotal - baseTotal;
      const pct       = baseTotal !== 0 ? (diff / baseTotal) : 0;

      series.push({ year, diff, pct, totalEnd: endTotal });
    });

    series.sort((a, b) => parseInt(a.year, 10) - parseInt(b.year, 10));
    return series;
  }

  // ===== Rellenar select de cuentas =====
  function fillCalCuentaOptions() {
    if (!$calCuenta) return;

    const prevVal = $calCuenta.value || "";
    const cuentas = getCuentas() || [];

    $calCuenta.innerHTML = "";

    const optAll = document.createElement("option");
    optAll.value = "";
    optAll.textContent = "Total (todas)";
    $calCuenta.append(optAll);

    cuentas.forEach(cta => {
      const opt = document.createElement("option");
      opt.value = cta;
      opt.textContent = cta;
      $calCuenta.append(opt);
    });

    if (prevVal && [...$calCuenta.options].some(o => o.value === prevVal)) {
      $calCuenta.value = prevVal;
    } else {
      $calCuenta.value = "";
    }
  }

  // ===== Defecto inicial (mes/año actuales) =====
  function ensureDefaults() {
    const now = new Date();
    const yNow = now.getFullYear();
    const mNow = String(now.getMonth() + 1).padStart(2, "0");

    if ($calMes &&
      !$calMes.value) {
      // input type="month" → YYYY-MM
      $calMes.value = `${yNow}-${mNow}`;
    }

    if ($calAnio && !$calAnio.value) {
      $calAnio.value = String(yNow);
    }
  }

  // ===== Render principal =====
  function buildCalendarView() {
    if (!$calGrid) return;

    const regs = getSortedRegistros();
    if (!regs.length) {
      $calGrid.innerHTML = '<div class="muted">Sin datos todavía.</div>';
      return;
    }

    ensureDefaults();
    fillCalCuentaOptions();

    const modo   = $calModo ? $calModo.value : "dia";
    const cuenta = ($calCuenta && $calCuenta.value) || "";

    if ($calMes && $calMes.parentElement) {
      $calMes.parentElement.style.display = (modo === "dia") ? "" : "none";
    }
    if ($calAnio && $calAnio.parentElement) {
      $calAnio.parentElement.style.display = (modo === "dia") ? "none" : "";
    }

    if (modo === "dia") {
      renderDayCalendar(cuenta || null);
    } else if (modo === "mes") {
      renderMonthCalendar(cuenta || null);
    } else {
      renderYearCalendar(cuenta || null);
    }
  }

  // ===== Vista día =====
  function renderDayCalendar(cuenta) {
    if (!$calGrid || !$calMes) return;

    const monthVal = $calMes.value;
    const yearInput = $calAnio ? $calAnio.value : "";

    if (!monthVal && !yearInput) {
      $calGrid.innerHTML = '<div class="muted">Selecciona mes y año.</div>';
      return;
    }

    let year;
    let monthNum;

    // Si el input es type="month" (YYYY-MM)
    if (monthVal && monthVal.includes("-")) {
      const [yStrRaw, mStrRaw] = monthVal.split("-");
      year = parseInt(yStrRaw, 10);
      monthNum = parseInt(mStrRaw, 10);
    } else {
      // Si es un selector de 1–12, usamos el año del segundo input
      year = parseInt(yearInput || "", 10);
      monthNum = monthVal ? parseInt(monthVal, 10) : NaN;
    }

    if (!Number.isFinite(year) || !Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) {
      $calGrid.innerHTML = '<div class="muted">Selecciona mes y año.</div>';
      return;
    }

    const yStr = String(year);
    const mStr = String(monthNum).padStart(2, "0");

    const first = new Date(year, monthNum - 1, 1);
    const startWeekday = (first.getDay() + 6) % 7; // lunes = 0
    const daysInMonth = new Date(year, monthNum, 0).getDate();

    const daily = computeDailySeries(cuenta);
    const weeks = [];
    let dayCounter = 1 - startWeekday;

    while (dayCounter <= daysInMonth) {
      const row = [];
      for (let i = 0; i < 7; i++, dayCounter++) {
        if (dayCounter < 1 || dayCounter > daysInMonth) {
          row.push(null);
        } else {
          const dStr = String(dayCounter).padStart(2, "0");
          const dateStr = `${yStr}-${mStr}-${dStr}`;
          const stats = daily.get(dateStr) || null;
          row.push({ day: dayCounter, dateStr, stats });
        }
      }
      weeks.push(row);
    }

    let html = '<div class="cal-grid-inner">';
    const dow = ["L", "M", "X", "J", "V", "S", "D"];

    html += '<div class="cal-week cal-week-head">' +
      dow.map(d => `<div class="cal-cell cal-head">${d}</div>`).join("") +
      '</div>';

    weeks.forEach(week => {
      html += '<div class="cal-week">';
      week.forEach(cell => {
        if (!cell) {
          html += '<div class="cal-cell cal-empty"></div>';
          return;
        }

        const s = cell.stats;
        let cls = "cal-cell cal-day";
        let diffStr = "—";
        let pctStr = "—";

        if (s) {
          diffStr = numberToEs(s.diff);
          pctStr = pctToEs(s.pct);

          if (s.diff > 0)      cls += " cal-pos";
          else if (s.diff < 0) cls += " cal-neg";
          else                 cls += " cal-zero";
        } else {
          cls += " cal-no-data";
        }

        if (cell.dateStr === TODAY_STR) {
          cls += " cal-today";
        }

        html += `<div class="${cls}">
          <div class="cal-day-num">${cell.day}</div>
          <div class="cal-amount">${diffStr}</div>
          <div class="cal-pct">${pctStr}</div>
        </div>`;
      });
      html += '</div>';
    });

    html += '</div>';
    $calGrid.innerHTML = html;
  }

  // ===== Vista mes =====
  function renderMonthCalendar(cuenta) {
    if (!$calGrid || !$calAnio) return;
    const yearStr = $calAnio.value || "";
    const year = parseInt(yearStr, 10);
    if (!year) {
      $calGrid.innerHTML = '<div class="muted">Pon un año.</div>';
      return;
    }

    const series = computeMonthlySeries(cuenta);
    if (!series.length) {
      $calGrid.innerHTML = '<div class="muted">Sin datos.</div>';
      return;
    }

    const map = new Map(series.map(s => [s.key, s]));
    const monthsShort = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

    let html = '<div class="cal-grid-month">';
    for (let m = 1; m <= 12; m++) {
      const mStr = String(m).padStart(2, "0");
      const key = `${yearStr}-${mStr}`;
      const s = map.get(key) || null;

      let cls = "cal-cell cal-month-cell";
      let diffStr = "—";
      let pctStr  = "—";

      if (s) {
        diffStr = numberToEs(s.diff);
        pctStr  = pctToEs(s.pct);
        if (s.diff > 0)      cls += " cal-pos";
        else if (s.diff < 0) cls += " cal-neg";
        else                 cls += " cal-zero";
      } else {
        cls += " cal-no-data";
      }

      html += `<div class="${cls}">` +
        `<div class="cal-label-main">${monthsShort[m - 1]}</div>` +
        `<div class="cal-amount">${diffStr}</div>` +
        `<div class="cal-pct">${pctStr}</div>` +
      `</div>`;
    }
    html += '</div>';

    $calGrid.innerHTML = html;
  }

  // ===== Vista año =====
  function renderYearCalendar(cuenta) {
    if (!$calGrid) return;
    const series = computeYearlySeries(cuenta);
    if (!series.length) {
      $calGrid.innerHTML = '<div class="muted">Sin datos.</div>';
      return;
    }

    let html = '<div class="cal-grid-year">';
    series.forEach(s => {
      let cls = "cal-cell cal-year-cell";
      const diffStr = numberToEs(s.diff);
      const pctStr  = pctToEs(s.pct);

      if (s.diff > 0)      cls += " cal-pos";
      else if (s.diff < 0) cls += " cal-neg";
      else                 cls += " cal-zero";

      html += `<div class="${cls}">` +
        `<div class="cal-label-main">${s.year}</div>` +
        `<div class="cal-amount">${diffStr}</div>` +
        `<div class="cal-pct">${pctStr}</div>` +
      `</div>`;
    });
    html += '</div>';

    $calGrid.innerHTML = html;
  }

  // ===== Listeners =====
  if ($calModo)   $calModo.addEventListener("change", buildCalendarView);
  if ($calMes)    $calMes.addEventListener("change", buildCalendarView);
  if ($calAnio)   $calAnio.addEventListener("change", buildCalendarView);
  if ($calCuenta) $calCuenta.addEventListener("change", buildCalendarView);

  if ($tabCal) {
    $tabCal.addEventListener("click", () => {
      buildCalendarView();
    });
  }

  window.addEventListener("finanzas-data-updated", () => {
    const panel = document.getElementById("tab-calendario");
    if (panel && !panel.hidden) {
      buildCalendarView();
    }
  });

  fillCalCuentaOptions();
  ensureDefaults();
  buildCalendarView();

  console.log("[CALENDARIO] listo");
})();
