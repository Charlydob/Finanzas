// js/youtube.js
(function () {
  const STORAGE_KEY = "finanzas_youtube_v1";

  function parseEuro(str) {
    if (!str) return NaN;
    str = String(str).trim();
    str = str.replace(/[€\s]/g, "");
    str = str.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(str);
    return isNaN(n) ? NaN : n;
  }

  function formatEuro(n) {
    const val = Number.isFinite(n) ? n : 0;
    return val.toLocaleString("es-ES", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €";
  }

  function getCurrentMonthKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  function formatMonthLabel(key) {
    const parts = key.split("-");
    if (parts.length !== 2) return key;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = new Date(y, m, 1);
    return d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object") return obj;
    } catch (e) {
      console.warn("[YT] error al leer localStorage", e);
    }
    return {};
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("[YT] error al guardar localStorage", e);
    }
  }

  function ensureMonth(key) {
    if (!data[key]) {
      data[key] = { ingreso: 0, comida: 0, videos: 0 };
    }
  }

  function getMonthList() {
    return Object.keys(data).sort();
  }

  let data = loadData();
  let currentMonth = getCurrentMonthKey();

  function setCurrentMonth(key) {
    if (!key) key = getCurrentMonthKey();
    currentMonth = key;
    ensureMonth(currentMonth);
    const mesInput = document.getElementById("yt-mes");
    if (mesInput && mesInput.value !== key) {
      mesInput.value = key;
    }
    render();
  }

  function render() {
    const tab = document.getElementById("tab-youtube");
    if (!tab) return;

    ensureMonth(currentMonth);
    const obj = data[currentMonth] || { ingreso: 0, comida: 0, videos: 0 };

    const ingreso = Number(obj.ingreso) || 0;
    const comida = Number(obj.comida) || 0;
    const videos = Number(obj.videos) || 0;
    const resto = ingreso - comida;

    const elIngreso = document.getElementById("yt-ingreso");
    const elComida = document.getElementById("yt-comida");
    const elResto = document.getElementById("yt-resto");
    const elVideos = document.getElementById("yt-videos-label");
    const elMesLabel = document.getElementById("yt-mes-label");
    const elRing = document.getElementById("yt-ring");
    const elRingText = document.getElementById("yt-ring-text");
    const elRestLine = tab.querySelector(".yt-summary-rest");

    if (elIngreso) elIngreso.textContent = formatEuro(ingreso);
    if (elComida) elComida.textContent = formatEuro(comida);
    if (elResto) elResto.textContent = formatEuro(resto);
    if (elVideos) elVideos.textContent = String(videos);
    if (elMesLabel) elMesLabel.textContent = formatMonthLabel(currentMonth);

    if (elRestLine) {
      elRestLine.classList.toggle("neg", resto < 0);
    }

    if (elRing && elRingText) {
      let pct = 0;
      if (ingreso > 0) {
        const ratio = Math.min(comida / ingreso, 1);
        pct = ratio * 360;
        elRingText.textContent = Math.round(ratio * 100) + "%";
      } else {
        elRingText.textContent = "0%";
      }
      elRing.style.setProperty("--pct", pct + "deg");
    }

    drawMoneyChart();
    drawVideosChart();
  }

  function drawMoneyChart() {
    const canvas = document.getElementById("yt-chart-money");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const months = getMonthList();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!months.length) return;

    const W = canvas.width;
    const H = canvas.height;
    const paddingLeft = 28;
    const paddingRight = 8;
    const paddingTop = 10;
    const paddingBottom = 22;

    const plotW = W - paddingLeft - paddingRight;
    const plotH = H - paddingTop - paddingBottom;

    const valsIngreso = months.map((m) => (data[m]?.ingreso || 0));
    const valsComida = months.map((m) => (data[m]?.comida || 0));
    let maxVal = Math.max(...valsIngreso, ...valsComida, 1);
    if (maxVal <= 0) maxVal = 1;

    ctx.strokeStyle = "rgba(148,163,184,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, paddingTop);
    ctx.lineTo(paddingLeft, H - paddingBottom);
    ctx.lineTo(W - paddingRight, H - paddingBottom);
    ctx.stroke();

    const count = months.length;
    const barWidth = plotW / Math.max(count * 1.6, 1);
    const stepX = count > 1 ? plotW / (count - 1) : 0;

    // Barras: ingresos YouTube (verde)
    ctx.fillStyle = "#22c55e";
    months.forEach((m, i) => {
      const val = data[m]?.ingreso || 0;
      const xCenter = paddingLeft + (count === 1 ? plotW / 2 : i * stepX);
      const h = (val / maxVal) * plotH;
      const x = xCenter - barWidth / 2;
      const y = paddingTop + (plotH - h);
      ctx.fillRect(x, y, barWidth, h);
    });

    // Línea: gasto comida (rojo)
    ctx.strokeStyle = "#f97373";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    months.forEach((m, i) => {
      const val = data[m]?.comida || 0;
      const x = paddingLeft + (count === 1 ? plotW / 2 : i * stepX);
      const y = paddingTop + (plotH - (val / maxVal) * plotH);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Etiquetas de mes
    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px Poppins, system-ui";
    months.forEach((m, i) => {
      const x = paddingLeft + (count === 1 ? plotW / 2 : i * stepX);
      const [y, mm] = m.split("-");
      const label = mm + "/" + String(y).slice(2);
      ctx.fillText(label, x - 12, H - 6);
    });
  }

  function drawVideosChart() {
    const canvas = document.getElementById("yt-chart-videos");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const months = getMonthList();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!months.length) return;

    const W = canvas.width;
    const H = canvas.height;
    const paddingLeft = 28;
    const paddingRight = 8;
    const paddingTop = 10;
    const paddingBottom = 22;

    const plotW = W - paddingLeft - paddingRight;
    const plotH = H - paddingTop - paddingBottom;

    const valsVideos = months.map((m) => (data[m]?.videos || 0));
    let maxVal = Math.max(...valsVideos, 1);
    if (maxVal <= 0) maxVal = 1;

    ctx.strokeStyle = "rgba(148,163,184,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, paddingTop);
    ctx.lineTo(paddingLeft, H - paddingBottom);
    ctx.lineTo(W - paddingRight, H - paddingBottom);
    ctx.stroke();

    const count = months.length;
    const barWidth = plotW / Math.max(count * 1.4, 1);
    const stepX = count > 1 ? plotW / (count - 1) : 0;

    ctx.fillStyle = "#6366f1";
    months.forEach((m, i) => {
      const val = data[m]?.videos || 0;
      const xCenter = paddingLeft + (count === 1 ? plotW / 2 : i * stepX);
      const h = (val / maxVal) * plotH;
      const x = xCenter - barWidth / 2;
      const y = paddingTop + (plotH - h);
      ctx.fillRect(x, y, barWidth, h);
    });

    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px Poppins, system-ui";
    months.forEach((m, i) => {
      const x = paddingLeft + (count === 1 ? plotW / 2 : i * stepX);
      const [y, mm] = m.split("-");
      const label = mm + "/" + String(y).slice(2);
      ctx.fillText(label, x - 12, H - 6);
    });
  }

  function init() {
    console.log("[YT] youtube.js init");

    const tab = document.getElementById("tab-youtube");
    if (!tab) return;

    const mesInput = document.getElementById("yt-mes");
    const btnIngreso = document.getElementById("yt-btn-add-ingreso");
    const btnComida = document.getElementById("yt-btn-add-comida");
    const btnVideos = document.getElementById("yt-btn-set-videos");
    const inputIngreso = document.getElementById("yt-input-ingreso");
    const inputComida = document.getElementById("yt-input-comida");
    const inputVideos = document.getElementById("yt-input-videos");

    ensureMonth(currentMonth);

    if (mesInput) {
      mesInput.value = currentMonth;
      mesInput.addEventListener("change", () => {
        const val = mesInput.value || getCurrentMonthKey();
        setCurrentMonth(val);
        saveData();
      });
    }

    if (btnIngreso && inputIngreso) {
      btnIngreso.addEventListener("click", () => {
        const val = parseEuro(inputIngreso.value);
        if (!isNaN(val) && val !== 0) {
          ensureMonth(currentMonth);
          data[currentMonth].ingreso = (data[currentMonth].ingreso || 0) + val;
          saveData();
          inputIngreso.value = "";
          render();
        }
      });
    }

    if (btnComida && inputComida) {
      btnComida.addEventListener("click", () => {
        const val = parseEuro(inputComida.value);
        if (!isNaN(val) && val !== 0) {
          ensureMonth(currentMonth);
          data[currentMonth].comida = (data[currentMonth].comida || 0) + val;
          saveData();
          inputComida.value = "";
          render();
        }
      });
    }

    if (btnVideos && inputVideos) {
      btnVideos.addEventListener("click", () => {
        const val = parseInt(inputVideos.value, 10);
        if (!isNaN(val) && val >= 0) {
          ensureMonth(currentMonth);
          data[currentMonth].videos = val;
          saveData();
          render();
        }
      });
    }

    const tabBtn = document.querySelector(".tab-youtube");
    if (tabBtn) {
      tabBtn.addEventListener("click", () => {
        render();
      });
    }

    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
