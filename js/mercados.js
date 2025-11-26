// js/mercados.js
(() => {
  "use strict";

  const STORAGE_KEY = "finanzas_mercados_watchlist";

  // Mapa simple símbolo -> id CoinGecko (cripto)
  const COINGECKO_MAP = {
    BTC: "bitcoin",
    ETH: "ethereum",
    SOL: "solana",
    ADA: "cardano",
    BNB: "binancecoin",
    XRP: "ripple",
    DOGE: "dogecoin",
    AVAX: "avalanche-2"
  };

  const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

  function parseEs(raw) {
    if (!raw) return 0;
    const s = String(raw)
      .replace(/[€\s]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function numberToEs(n, decimals = 2) {
    return Number(n || 0).toLocaleString("es-ES", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  // ------- FETCH PRECIOS -------

  async function fetchCryptoPrice(symbol) {
    const key = symbol.trim().toUpperCase();
    const id = COINGECKO_MAP[key];
    if (!id) {
      throw new Error("Cripto no soportada en el conversor.");
    }

    const url =
      "https://api.coingecko.com/api/v3/simple/price?ids=" +
      encodeURIComponent(id) +
      "&vs_currencies=eur";

    const res = await fetch(url);
    if (!res.ok) throw new Error("Error al obtener precio (HTTP cripto).");

    const data = await res.json();
    const price = data[id]?.eur;
    if (typeof price !== "number") {
      throw new Error("No se ha encontrado precio en EUR.");
    }

    return { price, id, symbol: key, currency: "EUR" };
  }

  async function fetchStockByTicker(symbol) {
    const q = symbol.trim().toUpperCase();
    const url =
      "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" +
      encodeURIComponent(q);

    const res = await fetch(url);
    if (!res.ok) throw new Error("Error al obtener precio (HTTP bolsa).");

    const data = await res.json();
    const item =
      data &&
      data.quoteResponse &&
      Array.isArray(data.quoteResponse.result) &&
      data.quoteResponse.result[0];

    if (!item || typeof item.regularMarketPrice !== "number") {
      throw new Error("No se ha encontrado precio para ese ticker.");
    }

    return {
      price: item.regularMarketPrice,
      symbol: item.symbol || q,
      currency: item.currency || "EUR",
      name: item.longName || item.shortName || item.symbol || q
    };
  }

  async function fetchStockByIsin(isinRaw) {
    const isin = isinRaw.trim().toUpperCase();
    const url =
      "https://query1.finance.yahoo.com/v1/finance/search?q=" +
      encodeURIComponent(isin) +
      "&quotesCount=1&newsCount=0";

    const res = await fetch(url);
    if (!res.ok) throw new Error("Error al buscar ISIN (HTTP).");

    const data = await res.json();
    const first =
      data &&
      data.quotes &&
      Array.isArray(data.quotes) &&
      data.quotes[0];

    if (!first || !first.symbol) {
      throw new Error("No se ha encontrado ningún ticker para esa ISIN.");
    }

    // Reutilizamos la lógica de ticker para pillar precio y moneda
    return fetchStockByTicker(first.symbol);
  }

  async function fetchStockOrEtfPrice(rawSymbolOrIsin) {
    const s = rawSymbolOrIsin.trim().toUpperCase();
    if (!s) throw new Error("Ticker / ISIN vacío.");

    if (ISIN_REGEX.test(s)) {
      // Parece una ISIN
      return fetchStockByIsin(s);
    }

    // Ticker directo: NVDA, GLD, GC=F (oro), etc.
    return fetchStockByTicker(s);
  }

  async function fetchAssetPrice(tipo, rawSymbol, precioManual) {
    if (tipo === "crypto") {
      return fetchCryptoPrice(rawSymbol);
    }

    // Bolsa / ETF / fondos
    try {
      return await fetchStockOrEtfPrice(rawSymbol);
    } catch (e) {
      // Fallback: si el usuario ha puesto precio manual, úsalo
      if (precioManual && !Number.isNaN(precioManual) && precioManual > 0) {
        return {
          price: precioManual,
          symbol: rawSymbol.trim().toUpperCase(),
          currency: "EUR",
          name: rawSymbol.trim().toUpperCase()
        };
      }
      throw e;
    }
  }

  // ------- STORAGE -------

  function loadWatchlist() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("[MERCADOS] Error cargando watchlist", e);
      return [];
    }
  }

  function saveWatchlist(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error("[MERCADOS] Error guardando watchlist", e);
    }
  }

  // ------- UI -------

  document.addEventListener("DOMContentLoaded", () => {
    const $tipo = document.getElementById("merc-tipo");
    const $simbolo = document.getElementById("merc-simbolo");
    const $cantidad = document.getElementById("merc-cantidad"); // UNIDADES
    const $precioManual = document.getElementById("merc-precio-manual");
    const $btnCalcular = document.getElementById("merc-btn-calcular");
    const $btnGuardar = document.getElementById("merc-btn-guardar");
    const $btnRefrescar = document.getElementById("merc-btn-refrescar");
    const $resultado = document.getElementById("merc-resultado");
    const $lista = document.getElementById("mercados-list-body");

    if (
      !$tipo ||
      !$simbolo ||
      !$cantidad ||
      !$btnCalcular ||
      !$btnGuardar ||
      !$btnRefrescar ||
      !$resultado ||
      !$lista
    ) {
      return;
    }

    let watchlist = loadWatchlist();
    let lastCalc = null;

    function renderList() {
      if (!watchlist.length) {
        $lista.classList.add("muted");
        $lista.textContent = "No has guardado ningún activo todavía.";
        return;
      }

      $lista.classList.remove("muted");
      $lista.innerHTML = "";

      watchlist.forEach((item) => {
        const row = document.createElement("div");
        row.className = "merc-item";

        const tipoLabel = item.tipo === "crypto" ? "Cripto" : "Acción/ETF/Fondo";
        const valor =
          item.lastPrice && item.lastPrice > 0
            ? item.lastPrice * item.units
            : null;
        const currency = item.currency || "EUR";

        row.innerHTML = `
          <div class="merc-item-main">
            <div class="merc-item-title">
              ${item.symbol} · ${tipoLabel}
            </div>
            <div class="merc-item-meta">
              Unidades: <span>${item.units}</span>
              · Precio: <span>${
                item.lastPrice
                  ? numberToEs(item.lastPrice) + " " + currency + "/u"
                  : "—"
              }</span>
            </div>
          </div>
          <div class="merc-item-right">
            <div class="merc-item-value">${
              valor !== null
                ? numberToEs(valor) + " " + currency
                : "—"
            }</div>
            <button class="merc-item-delete" aria-label="Eliminar">×</button>
          </div>
        `;

        const btnDel = row.querySelector(".merc-item-delete");
        btnDel.addEventListener("click", () => {
          watchlist = watchlist.filter(
            (w) => !(w.symbol === item.symbol && w.tipo === item.tipo)
          );
          saveWatchlist(watchlist);
          renderList();
        });

        $lista.appendChild(row);
      });
    }

    // Calcular valor actual (sin guardar todavía)
    $btnCalcular.addEventListener("click", async () => {
      const tipo = $tipo.value;
      const symbol = $simbolo.value.trim();
      const units = parseEs($cantidad.value); // unidades (BTC, acciones, participaciones)
      const precioManualVal = parseEs($precioManual.value);

      if (!symbol) {
        $resultado.textContent = "Pon un símbolo / ticker o ISIN.";
        return;
      }
      if (!units || units <= 0) {
        $resultado.textContent = "Pon una cantidad de unidades válida.";
        return;
      }

      $resultado.textContent = "Buscando precio...";
      try {
        const { price, currency } = await fetchAssetPrice(
          tipo,
          symbol,
          tipo === "crypto" ? null : precioManualVal
        );
        const euroValue = units * price;
        const labelTipo =
          tipo === "crypto" ? "cripto" : "activo de bolsa / fondo";

        $resultado.textContent =
          `${units} ${symbol.toUpperCase()} ≈ ` +
          `${numberToEs(euroValue)} ${currency} ` +
          `(precio aprox. ${numberToEs(price)} ${currency}/u, ${labelTipo})`;

        lastCalc = {
          tipo,
          symbol: symbol.trim().toUpperCase(),
          units,
          price,
          currency: currency || "EUR"
        };
      } catch (err) {
        console.error("[MERCADOS] Error cálculo", err);
        $resultado.textContent =
          err && err.message
            ? err.message
            : "No se ha podido obtener el precio.";
        lastCalc = null;
      }
    });

    // Guardar en la lista de seguimiento
    $btnGuardar.addEventListener("click", () => {
      if (!lastCalc) {
        $resultado.textContent = "Primero calcula con un precio válido.";
        return;
      }

      const nuevo = {
        tipo: lastCalc.tipo,
        symbol: lastCalc.symbol,
        units: lastCalc.units,
        lastPrice: lastCalc.price,
        currency: lastCalc.currency
      };

      // Un activo único por tipo+símbolo: se actualiza si ya existe
      const idx = watchlist.findIndex(
        (w) => w.symbol === nuevo.symbol && w.tipo === nuevo.tipo
      );
      if (idx >= 0) {
        watchlist[idx] = nuevo;
      } else {
        watchlist.push(nuevo);
      }

      saveWatchlist(watchlist);
      renderList();
    });

    // Actualizar todos los precios de la lista
    $btnRefrescar.addEventListener("click", async () => {
      if (!watchlist.length) return;

      $btnRefrescar.disabled = true;
      $btnRefrescar.textContent = "Actualizando...";

      try {
        for (const item of watchlist) {
          try {
            if (item.tipo === "crypto") {
              const { price, currency } = await fetchCryptoPrice(item.symbol);
              item.lastPrice = price;
              item.currency = currency || "EUR";
            } else {
              const { price, currency } = await fetchStockOrEtfPrice(
                item.symbol
              );
              item.lastPrice = price;
              item.currency = currency || "EUR";
            }
          } catch (e) {
            console.error(
              "[MERCADOS] Error actualizando",
              item.symbol,
              e
            );
          }
        }
        saveWatchlist(watchlist);
        renderList();
      } finally {
        $btnRefrescar.disabled = false;
        $btnRefrescar.textContent = "Actualizar todos";
      }
    });

    // Pintar lo que haya guardado al entrar
    renderList();
  });
})();