"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Layers,
  Paintbrush,
  SlidersHorizontal,
  FileText,
  Upload,
  Download,
  Calculator,
  DollarSign,
  Truck,
  Hammer,
  Wrench,
  Package,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Eye,
  Sparkles,
  BarChart3,
  ChevronUp,
  ChevronDown,
  Percent,
  Settings2,
  Tag,
  Minus,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Connection Status Component ──────────────────────────────────
function ConnectionStatus() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/health`);
        setStatus(res.ok ? "connected" : "disconnected");
      } catch {
        setStatus("disconnected");
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  if (status === "checking") return null;

  return (
    <div className={`fixed bottom-4 right-4 px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 border shadow-lg backdrop-blur-sm z-50 ${status === "connected"
      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
      : "bg-rose-500/10 border-rose-500/20 text-rose-400"
      }`}>
      <div className={`w-2 h-2 rounded-full ${status === "connected" ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`} />
      {status === "connected" ? "System Online" : "Backend Offline"}
    </div>
  );
}

// ── NumberStepper: Fast up/down arrows with acceleration on hold ──
function NumberStepper({ value, onChange, min = 0, max = 99999, step = 1, precision = 2, label, icon, unit = "", id }) {
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const speedRef = useRef(200);

  const clamp = (v) => {
    const clamped = Math.max(min, Math.min(max, v));
    return Number(clamped.toFixed(precision));
  };

  const startHold = (direction) => {
    // Immediate first step
    onChange(clamp(value + step * direction));
    speedRef.current = 180; // start interval

    const accelerate = () => {
      intervalRef.current = setInterval(() => {
        onChange((prev) => clamp(prev + step * direction));
      }, speedRef.current);

      // Accelerate: after a short delay, go faster
      timeoutRef.current = setTimeout(() => {
        clearInterval(intervalRef.current);
        speedRef.current = Math.max(30, speedRef.current * 0.55); // ramp up speed aggressively
        accelerate();
      }, Math.max(300, speedRef.current * 4));
    };

    accelerate();
  };

  const stopHold = () => {
    clearInterval(intervalRef.current);
    clearTimeout(timeoutRef.current);
    speedRef.current = 200;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div className="stepper-group" id={id}>
      {label && (
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
          {icon && <span className="inline mr-1">{icon}</span>}
          {label}
        </label>
      )}
      <div className="flex items-stretch rounded-xl overflow-hidden border border-slate-700/60 bg-slate-900/80 h-10">
        <button
          className="stepper-btn flex items-center justify-center w-8 hover:bg-slate-700/60 active:bg-slate-600/60 transition-colors text-slate-400 hover:text-rose-400 select-none"
          onMouseDown={() => startHold(-1)}
          onMouseUp={stopHold}
          onMouseLeave={stopHold}
          onTouchStart={() => startHold(-1)}
          onTouchEnd={stopHold}
          tabIndex={-1}
          aria-label="Decrease"
        >
          <ChevronDown size={14} />
        </button>
        <div className="flex items-center gap-1 px-2 min-w-[72px] justify-center border-x border-slate-700/40">
          <span className="text-slate-100 font-bold text-sm font-mono tabular-nums">
            {unit === "$" ? `$${value.toFixed(precision)}` : `${value.toFixed(precision)}${unit}`}
          </span>
        </div>
        <button
          className="stepper-btn flex items-center justify-center w-8 hover:bg-slate-700/60 active:bg-slate-600/60 transition-colors text-slate-400 hover:text-emerald-400 select-none"
          onMouseDown={() => startHold(1)}
          onMouseUp={stopHold}
          onMouseLeave={stopHold}
          onTouchStart={() => startHold(1)}
          onTouchEnd={stopHold}
          tabIndex={-1}
          aria-label="Increase"
        >
          <ChevronUp size={14} />
        </button>
      </div>
    </div>
  );
}


export default function CabinetBiddingDashboard() {
  // ── State ──────────────────────────────────────────────────────
  const [brands, setBrands] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState("");
  const [finishes, setFinishes] = useState([]);
  const [selectedFinish, setSelectedFinish] = useState("");
  const [margin, setMargin] = useState(0);
  const [skuText, setSkuText] = useState("");
  const [includeInstall, setIncludeInstall] = useState(false);
  const [quoteResult, setQuoteResult] = useState(null);
  const [quoteMode, setQuoteMode] = useState("dual");
  const [dualBrandQuotes, setDualBrandQuotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [parseStatus, setParseStatus] = useState(null);
  const [parseMeta, setParseMeta] = useState(null);
  const [parseError, setParseError] = useState("");
  const [autoCalc, setAutoCalc] = useState(true);
  const fileInputRef = useRef(null);
  const debounceRef = useRef(null);

  // ── Customizable Rate Overrides ────────────────────────────────
  const [factor, setFactor] = useState(0.126);
  const [buildRate, setBuildRate] = useState(20.0);
  const [installRate, setInstallRate] = useState(79.0);
  const [shippingRate, setShippingRate] = useState(125.0);
  const [handlePrice, setHandlePrice] = useState(2.75);
  const [discountPct, setDiscountPct] = useState(0);

  const applyBrandFinishSelection = useCallback((brandName, finishName = "") => {
    const brand = brands.find((b) => b.name === brandName);
    if (!brand) return;
    setSelectedBrand(brand.name);
    setFinishes(brand.finishes);
    const chosenFinish = finishName && brand.finishes.includes(finishName)
      ? finishName
      : (brand.finishes[0] || "");
    setSelectedFinish(chosenFinish);
  }, [brands]);

  const detectBrandFinishFromText = useCallback((rawText) => {
    if (!rawText || !brands.length) return { brand: "", finish: "" };

    const textUpper = rawText.toUpperCase();
    let brand = "";
    if (/\bFRAMELESS\b/i.test(textUpper)) {
      brand = "Frameless";
    } else if (/\bFRAMED\b/i.test(textUpper)) {
      brand = "Framed";
    }

    if (!brand) return { brand: "", finish: "" };

    const findFinishInBrand = (brandName) => {
      const b = brands.find((x) => x.name === brandName);
      if (!b) return "";
      // Longest first prevents partial-name mismatches.
      const ordered = [...b.finishes].sort((a, c) => c.length - a.length);
      return ordered.find((f) => textUpper.includes(String(f).toUpperCase())) || "";
    };

    return { brand, finish: findFinishInBrand(brand) };
  }, [brands]);

  const getDefaultFinishForBrand = useCallback((brandName) => {
    const b = brands.find((x) => x.name === brandName);
    return b?.finishes?.[0] || "";
  }, [brands]);

  const calculateDualBrandQuotes = useCallback(async (items) => {
    const targets = ["Frameless", "Framed"];
    const next = [];

    for (const brandName of targets) {
      const finish = getDefaultFinishForBrand(brandName);
      if (!finish) continue;
      try {
        const res = await fetch(`${API_BASE}/api/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brand: brandName,
            finish,
            margin,
            items,
            include_install: includeInstall,
            factor,
            build_rate: buildRate,
            shipping_rate: shippingRate,
            install_rate: installRate,
            handle_price: handlePrice,
            discount_pct: discountPct,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ detail: "Calculation failed" }));
          throw new Error(errData.detail || "Calculation failed");
        }
        const data = await res.json();
        next.push({ brand: brandName, finish, result: data, error: "" });
      } catch (e) {
        next.push({ brand: brandName, finish, result: null, error: e.message || "Calculation failed" });
      }
    }

    setDualBrandQuotes(next);
    setQuoteResult(null);
  }, [buildRate, discountPct, factor, getDefaultFinishForBrand, handlePrice, includeInstall, installRate, margin, shippingRate]);

  // ── Load Brands on Mount ───────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/api/brands`)
      .then((r) => r.json())
      .then((data) => {
        setBrands(data.brands);
        if (data.brands.length > 0) {
          setSelectedBrand(data.brands[0].name);
          setFinishes(data.brands[0].finishes);
          if (data.brands[0].finishes.length > 0) {
            setSelectedFinish(data.brands[0].finishes[0]);
          }
        }
      })
      .catch(() => console.error("Backend not available"));
  }, []);

  // ── Brand Change Handler ───────────────────────────────────────
  const handleBrandChange = (brandName) => {
    setSelectedBrand(brandName);
    const brand = brands.find((b) => b.name === brandName);
    if (brand) {
      setFinishes(brand.finishes);
      setSelectedFinish(brand.finishes[0] || "");
    }
  };

  // ── Parse SKU Text ─────────────────────────────────────────────
  const parseSkuItems = useCallback((text) => {
    const lines = text.split("\n");
    const items = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const parts = trimmed.split(",");
      if (parts.length >= 2) {
        const sku = parts[0].trim();
        const qty = parseFloat(parts[1].trim());
        if (sku && !isNaN(qty) && qty > 0) {
          items.push({ sku, quantity: qty });
        }
      }
    }
    return items;
  }, []);

  // ── Calculate Quote ────────────────────────────────────────────
  const calculateQuote = useCallback(async () => {
    if (quoteMode !== "dual" && (!selectedBrand || !selectedFinish)) return;
    const items = parseSkuItems(skuText);
    if (items.length === 0) {
      setQuoteResult(null);
      setDualBrandQuotes([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (quoteMode === "dual") {
        await calculateDualBrandQuotes(items);
        return;
      }
      const res = await fetch(`${API_BASE}/api/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: selectedBrand,
          finish: selectedFinish,
          margin: margin,
          items: items,
          include_install: includeInstall,
          factor: factor,
          build_rate: buildRate,
          shipping_rate: shippingRate,
          install_rate: installRate,
          handle_price: handlePrice,
          discount_pct: discountPct,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: "Calculation failed" }));
        throw new Error(errData.detail || "Calculation failed");
      }
      const data = await res.json();
      setQuoteResult(data);
      setDualBrandQuotes([]);
    } catch (e) {
      console.error("Quote calculation failed:", e);
      setError(e.message);
      setQuoteResult(null);
      setDualBrandQuotes([]);
    } finally {
      setLoading(false);
    }
  }, [selectedBrand, selectedFinish, margin, skuText, includeInstall, factor, buildRate, shippingRate, installRate, handlePrice, discountPct, parseSkuItems, quoteMode, calculateDualBrandQuotes]);

  // ── Auto-calculate on changes ──────────────────────────────────
  useEffect(() => {
    if (!autoCalc) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      calculateQuote();
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [selectedBrand, selectedFinish, margin, skuText, includeInstall, autoCalc, calculateQuote, factor, buildRate, shippingRate, installRate, handlePrice, discountPct, quoteMode]);

  // ── File Drop/Upload ───────────────────────────────────────────
  const handleFileParse = async (file) => {
    setParseStatus("parsing");
    setParseMeta(null);
    setParseError("");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${API_BASE}/api/parse-file`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Upload failed" }));
        throw new Error(err.detail || "Upload failed");
      }
      const data = await res.json();
      const detected = detectBrandFinishFromText(data.raw_text || "");
      if (detected.brand) {
        applyBrandFinishSelection(detected.brand, detected.finish);
      }
      if (data.sku_lines && data.sku_lines.length > 0) {
        setSkuText(data.sku_lines.join("\n"));
        setParseMeta({
          totalFound: data.total_found || 0,
          uniqueSkus: Object.keys(data.found_skus || {}).length,
          method: `${data.method || "AI Extraction"}${data.parsed_sources ? ` • ${data.parsed_sources} file(s)` : ""}${detected.brand ? ` • ${detected.brand}${detected.finish ? ` / ${detected.finish}` : ""} explicit` : " • brand not explicit (dual quote mode)"}`,
        });
        setParseStatus("success");
      } else {
        setParseMeta({
          totalFound: data.total_found || 0,
          uniqueSkus: 0,
          method: `${data.method || "Unknown"}${data.parsed_sources ? ` • ${data.parsed_sources} file(s)` : ""}${detected.brand ? ` • ${detected.brand}${detected.finish ? ` / ${detected.finish}` : ""} explicit` : " • brand not explicit"}`,
        });
        setParseStatus("empty");
      }
      setTimeout(() => setParseStatus(null), 3000);
    } catch (e) {
      setParseError(e?.message || "Error parsing file");
      setParseStatus("error");
      setTimeout(() => setParseStatus(null), 3000);
    }
  }, [detectBrandFinishFromText, applyBrandFinishSelection]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileParse(file);
  };

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (file) handleFileParse(file);
  };

  // ── PDF Export ─────────────────────────────────────────────────
  const exportPDF = async () => {
    const jsPDF = (await import("jspdf")).default;
    await import("jspdf-autotable");

    const doc = new jsPDF();
    const now = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Header
    doc.setFillColor(15, 17, 23);
    doc.rect(0, 0, 210, 40, "F");
    doc.setTextColor(251, 191, 36);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("CABINET BID PROPOSAL", 14, 22);
    doc.setFontSize(10);
    doc.setTextColor(180, 185, 200);
    doc.text(`Date: ${now}`, 14, 32);
    doc.text(`Brand: ${selectedBrand} | Finish: ${selectedFinish}`, 80, 32);
    doc.text(`Margin: ${margin}% | Discount: ${discountPct}%`, 180, 32, { align: "right" });

    // Line items table
    if (quoteResult?.lines) {
      const tableData = quoteResult.lines.map((l) => [
        l.sku,
        l.resolved_sku !== l.sku ? l.resolved_sku : "—",
        l.quantity,
        `$${l.unit_price.toFixed(2)}`,
        `$${l.line_total.toFixed(2)}`,
        l.found ? "✓" : "✗",
      ]);

      doc.autoTable({
        startY: 48,
        head: [["SKU", "Resolved", "Qty", "Unit Price", "Total", "Found"]],
        body: tableData,
        theme: "grid",
        headStyles: {
          fillColor: [26, 29, 40],
          textColor: [251, 191, 36],
          fontStyle: "bold",
          fontSize: 9,
        },
        bodyStyles: {
          fillColor: [15, 17, 23],
          textColor: [200, 205, 220],
          fontSize: 9,
        },
        alternateRowStyles: { fillColor: [20, 22, 30] },
        columnStyles: { 0: { fontStyle: "bold" } },
      });
    }

    // Cost Summary
    const summaryY = doc.lastAutoTable?.finalY + 16 || 120;
    doc.setFillColor(26, 29, 40);
    doc.roundedRect(14, summaryY, 182, 72, 4, 4, "F");
    doc.setTextColor(180, 185, 200);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");

    const labels = [
      [`Cabinet Revenue (List × ${factor}):`, `$${quoteResult?.cabinet_revenue?.toFixed(2) || "0.00"}`],
      [`Build Cost (${quoteResult?.box_count || 0} boxes × $${buildRate}):`, `$${quoteResult?.build_cost?.toFixed(2) || "0.00"}`],
      [`Shipping:`, `$${quoteResult?.shipping_cost?.toFixed(2) || "0.00"}`],
      [`Installation:`, `$${quoteResult?.install_cost?.toFixed(2) || "0.00"}`],
      [`Bid (@ ${margin}% margin):`, `$${quoteResult?.bid_price?.toFixed(2) || "0.00"}`],
      [`Discount (${discountPct}%):`, `-$${quoteResult?.discount_amount?.toFixed(2) || "0.00"}`],
    ];
    labels.forEach(([label, val], i) => {
      doc.text(label, 20, summaryY + 12 + i * 9);
      doc.text(val, 190, summaryY + 12 + i * 9, { align: "right" });
    });

    doc.setDrawColor(251, 191, 36);
    doc.line(20, summaryY + 62, 190, summaryY + 62);
    doc.setTextColor(251, 191, 36);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("GRAND TOTAL BID:", 20, summaryY + 70);
    doc.text(`$${quoteResult?.grand_total?.toFixed(2) || "0.00"}`, 190, summaryY + 70, { align: "right" });

    // Footer
    doc.setTextColor(120, 125, 140);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Generated by Cabinet Bidding Dashboard • Confidential & Proprietary", 105, 285, { align: "center" });

    doc.save(`Cabinet_Bid_${selectedBrand}_${selectedFinish}_${margin}pct.pdf`);
  };

  // ── Format currency ────────────────────────────────────────────
  const fmt = (n) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(n || 0);

  const parsedItemsCount = parseSkuItems(skuText).length;
  const hasExtractedCabinets = parsedItemsCount > 0;

  // ── Render ─────────────────────────────────────────────────────
  return (
    <main className="relative z-10 max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* ── HEADER ────────────────────────────────────────────── */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
            <span className="gradient-text">Cabinet Bidding</span>{" "}
            <span className="text-slate-200">Dashboard</span>
          </h1>
          <p className="text-slate-400 mt-1 text-sm">
            Professional contractor quoting • Mike-Logic™ pricing engine
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="badge badge-emerald">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-2 animate-pulse" />
            Live
          </span>
          <span className="badge badge-amber">v2.0</span>
        </div>
      </header>

      {/* Error Alert */}
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 flex items-center gap-3 px-4 py-3 bg-rose-500/10 border border-rose-500/20 text-rose-200 rounded-xl backdrop-blur-md shadow-xl max-w-md w-full">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto hover:text-white">
            <Minus size={16} />
          </button>
        </div>
      )}

      {/* ── WORKFLOW GUIDE ─────────────────────────────────────── */}
      <section className="glass-card p-5 mb-6 fade-in-up border-sky-500/20">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center">
            <Sparkles size={18} className="text-sky-400" />
          </div>
          <h2 className="text-lg font-bold text-slate-100">4-Step Bid Workflow</h2>
          <span className="badge badge-sky ml-2">Built for Teams</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
          <div className={`rounded-xl border p-3 ${hasExtractedCabinets ? "border-emerald-500/20 bg-emerald-500/5" : "border-slate-800 bg-slate-900/40"}`}>
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Step 1</div>
            <div className="font-semibold text-slate-100">Upload Plans / PDFs</div>
            <div className="text-slate-500 text-xs mt-1">Drop Builders Connected files, PDFs, or images.</div>
          </div>
          <div className={`rounded-xl border p-3 ${quoteResult ? "border-emerald-500/20 bg-emerald-500/5" : "border-slate-800 bg-slate-900/40"}`}>
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Step 2</div>
            <div className="font-semibold text-slate-100">AI Extracts Cabinets</div>
            <div className="text-slate-500 text-xs mt-1">See cabinet count + extracted receipt totals before pricing tweaks.</div>
          </div>
          <div className={`rounded-xl border p-3 ${hasExtractedCabinets ? "border-amber-500/20 bg-amber-500/5" : "border-slate-800 bg-slate-900/40 opacity-60"}`}>
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Step 3</div>
            <div className="font-semibold text-slate-100">Adjust Multipliers</div>
            <div className="text-slate-500 text-xs mt-1">Install, shipping, margin, discount, and overrides.</div>
          </div>
          <div className={`rounded-xl border p-3 ${quoteResult ? "border-amber-500/20 bg-amber-500/5" : "border-slate-800 bg-slate-900/40 opacity-60"}`}>
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Step 4</div>
            <div className="font-semibold text-slate-100">Export Quote</div>
            <div className="text-slate-500 text-xs mt-1">Finalize and send the bid when pricing is set.</div>
          </div>
        </div>
      </section>

      {/* ── GLOBAL SELECTORS ──────────────────────────────────── */}
      <section className="glass-card p-6 mb-6 fade-in-up" id="project-setup">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Layers size={18} className="text-amber-400" />
          </div>
          <h2 className="text-lg font-bold text-slate-100">Project Setup</h2>
          <span className="badge badge-amber ml-2">Step 1</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Brand */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              <Layers size={12} className="inline mr-1" />
              Brand / Style
            </label>
            <select
              id="brand-select"
              className="custom-select w-full"
              value={selectedBrand}
              onChange={(e) => handleBrandChange(e.target.value)}
            >
              {brands.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>

          {/* Finish */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              <Paintbrush size={12} className="inline mr-1" />
              Finish / Color
            </label>
            <select
              id="finish-select"
              className="custom-select w-full"
              value={selectedFinish}
              onChange={(e) => setSelectedFinish(e.target.value)}
            >
              {finishes.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          {/* Install Toggle */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              <Wrench size={12} className="inline mr-1" />
              Installation (${installRate}/box)
            </label>
            <div className="flex items-center gap-3 mt-1">
              <label className="toggle-switch" id="install-toggle">
                <input
                  type="checkbox"
                  checked={includeInstall}
                  onChange={(e) => setIncludeInstall(e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
              <span className="text-sm text-slate-300">
                {includeInstall ? "Included" : "Excluded"}
              </span>
            </div>
          </div>

          {/* Auto-calculate */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              <Sparkles size={12} className="inline mr-1" />
              Auto-Calculate
            </label>
            <div className="flex items-center gap-3 mt-1">
              <label className="toggle-switch" id="auto-calc-toggle">
                <input
                  type="checkbox"
                  checked={autoCalc}
                  onChange={(e) => setAutoCalc(e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
              <span className="text-sm text-slate-300">
                {autoCalc ? "Real-time" : "Manual"}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── INPUT & VISION AI ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Vision AI Upload (Primary Input) */}
        <section className="glass-card p-6 fade-in-up" id="vision-upload">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Eye size={18} className="text-purple-400" />
            </div>
            <h2 className="text-lg font-bold text-slate-100">Vision AI Upload</h2>
            <span className="badge badge-amber ml-2">Step 1A</span>
            <span className="badge badge-sky ml-2">Primary Workflow</span>
          </div>
          <div
            className={`dropzone ${dragOver ? "drag-over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.bmp,.tiff,.txt,.csv,.zip"
              className="hidden"
              onChange={handleFileInput}
              id="file-input"
            />
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-sky-500/10 flex items-center justify-center">
                <Upload size={28} className="text-sky-400" />
              </div>
              <div>
                <p className="text-slate-200 font-semibold">
                  Drop PDF / JPG elevations here
                </p>
                <p className="text-slate-500 text-sm mt-1">
                  or click to browse • PDF, JPG, PNG, TXT, CSV, ZIP
                </p>
              </div>
              {parseStatus === "parsing" && (
                <div className="flex items-center gap-2 text-amber-400 text-sm">
                  <div className="spinner" /> Parsing file...
                </div>
              )}
              {parseStatus === "success" && (
                <div className="flex items-center gap-2 text-emerald-400 text-sm">
                  <CheckCircle2 size={16} /> Cabinets extracted and quote updated.
                </div>
              )}
              {parseStatus === "empty" && (
                <div className="flex items-center gap-2 text-amber-400 text-sm">
                  <AlertCircle size={16} /> No cabinet codes found in file
                </div>
              )}
              {parseStatus === "error" && (
                <div className="flex items-center gap-2 text-rose-400 text-sm">
                  <AlertCircle size={16} /> {parseError || "Error parsing file"}
                </div>
              )}
            </div>
          </div>
          {parseMeta && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">Cabinets / Units</div>
                <div className="text-lg font-bold text-slate-100 tabular-nums">{parseMeta.totalFound}</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">Unique SKUs</div>
                <div className="text-lg font-bold text-slate-100 tabular-nums">{parseMeta.uniqueSkus}</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                <div className="text-[11px] uppercase tracking-wider text-slate-500">Extracted By</div>
                <div className="text-sm font-semibold text-sky-300 truncate">{parseMeta.method}</div>
              </div>
            </div>
          )}
          <div className="mt-4 p-4 rounded-xl bg-slate-900/50 border border-slate-800">
            <p className="text-xs text-slate-500 leading-relaxed">
              <Sparkles size={12} className="inline mr-1 text-purple-400" />
              Vision AI scans your elevation drawings for cabinet codes (e.g. B12, SB36, W3030)
              and automatically builds the cabinet list + quote. Manual SKU editing is optional.
            </p>
            <p className="text-xs text-slate-600 leading-relaxed mt-2">
              Toe kick / scribe / crown auto-ordering by run length is not fully automated yet. That requires plan-geometry extraction (run lengths) beyond SKU counting.
            </p>
          </div>
        </section>

        {/* SKU Input (Optional Override) */}
        <section className="glass-card p-6 fade-in-up" id="sku-input">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center">
              <FileText size={18} className="text-sky-400" />
            </div>
            <h2 className="text-lg font-bold text-slate-100">Extracted Cabinet List</h2>
            <span className="badge badge-amber ml-2">Step 1B</span>
            <span className="badge badge-purple ml-2">Optional Manual Edit</span>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Upload a PDF first. This list auto-populates from Vision AI and only needs edits if extraction misses something.
          </p>
          <textarea
            id="sku-textarea"
            className="sku-textarea"
            rows={12}
            value={skuText}
            onChange={(e) => setSkuText(e.target.value)}
            placeholder="# Cabinet list will populate here after PDF extraction (Format: SKU, Qty)"
          />
          <div className="flex items-center gap-3 mt-3">
            {!autoCalc && (
              <button onClick={calculateQuote} className="btn-primary" id="run-quote-btn">
                <Calculator size={16} />
                Run Quote
              </button>
            )}
            <button onClick={exportPDF} className="btn-secondary" id="export-pdf-btn" disabled={!quoteResult}>
              <Download size={16} />
              Export PDF
            </button>
            <div className="ml-auto text-xs text-slate-500">
              {parsedItemsCount} items parsed
            </div>
          </div>
        </section>
      </div>

      {/* ── GLOBAL VARIABLES & OVERRIDES ───────────────────────── */}
      <section className={`glass-card p-6 mb-6 fade-in-up relative ${!hasExtractedCabinets ? "opacity-70" : ""}`} id="rate-overrides">
        {!hasExtractedCabinets && (
          <div className="absolute inset-0 z-10 rounded-2xl bg-slate-950/35 backdrop-blur-[1px] flex items-center justify-center p-4">
            <div className="text-center max-w-md">
              <div className="text-sm font-semibold text-slate-200">Step 3 unlocks after Step 1 upload</div>
              <div className="text-xs text-slate-400 mt-1">Upload plans and let AI extract cabinets first. Then tune install, margin, and discounts.</div>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <Settings2 size={18} className="text-purple-400" />
          </div>
          <h2 className="text-lg font-bold text-slate-100">Pricing Controls & Overrides</h2>
          <span className="badge badge-purple ml-2">Step 3</span>
          <span className="badge badge-sky ml-2">Tariffs • Rates • Costs</span>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Adjust any rate on the fly — tariffs change, installers renegotiate, materials shift. Hold arrows to ramp up fast.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <NumberStepper
            id="factor-stepper"
            label="Discount Factor"
            value={factor}
            onChange={setFactor}
            min={0}
            max={1}
            step={0.001}
            precision={3}
            icon={<TrendingUp size={11} className="text-amber-400" />}
          />
          <NumberStepper
            id="build-stepper"
            label="Build $/Box"
            value={buildRate}
            onChange={setBuildRate}
            min={0}
            max={500}
            step={1}
            precision={0}
            unit="$"
            icon={<Hammer size={11} className="text-sky-400" />}
          />
          <NumberStepper
            id="install-stepper"
            label="Install $/Box"
            value={installRate}
            onChange={setInstallRate}
            min={0}
            max={500}
            step={1}
            precision={0}
            unit="$"
            icon={<Wrench size={11} className="text-rose-400" />}
          />
          <NumberStepper
            id="shipping-stepper"
            label="Shipping $"
            value={shippingRate}
            onChange={setShippingRate}
            min={0}
            max={2000}
            step={5}
            precision={0}
            unit="$"
            icon={<Truck size={11} className="text-purple-400" />}
          />
          <NumberStepper
            id="handle-stepper"
            label="Handle $/ea"
            value={handlePrice}
            onChange={setHandlePrice}
            min={0}
            max={50}
            step={0.25}
            precision={2}
            unit="$"
            icon={<Package size={11} className="text-emerald-400" />}
          />
          <div className="flex flex-col">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              <Sparkles size={11} className="inline mr-1 text-amber-400" />
              Reset Defaults
            </label>
            <button
              onClick={() => {
                setFactor(0.126);
                setBuildRate(20);
                setInstallRate(79);
                setShippingRate(125);
                setHandlePrice(2.75);
              }}
              className="h-10 rounded-xl border border-slate-700/60 bg-slate-900/80 text-xs font-semibold text-slate-400 hover:text-amber-400 hover:border-amber-500/40 transition-all"
            >
              ↺ Reset All
            </button>
          </div>
        </div>
      </section>

      {/* ── MARGIN + DISCOUNT SLIDERS ─────────────────────────── */}
      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 relative ${!hasExtractedCabinets ? "opacity-70" : ""}`}>
        {!hasExtractedCabinets && (
          <div className="absolute inset-0 z-10 rounded-2xl bg-slate-950/25" />
        )}
        {/* Margin Slider */}
        <section className="glass-card p-6 fade-in-up" id="margin-slider">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <TrendingUp size={18} className="text-amber-400" />
              </div>
              <h2 className="text-lg font-bold text-slate-100">Profit Margin</h2>
            </div>
            <span className="text-3xl font-black text-amber-400 tabular-nums">{margin}%</span>
          </div>
          <input
            id="margin-range"
            type="range"
            min="0"
            max="50"
            step="1"
            value={margin}
            onChange={(e) => setMargin(Number(e.target.value))}
            className="custom-slider"
          />
          <div className="flex justify-between mt-2 text-xs text-slate-500 font-mono">
            <span>0%</span>
            <span>10%</span>
            <span>20%</span>
            <span>30%</span>
            <span>40%</span>
            <span>50%</span>
          </div>
          <p className="text-xs text-slate-600 mt-2">Bid = Base Cost ÷ (1 − Margin)</p>
        </section>

        {/* Discount Slider */}
        <section className="glass-card p-6 fade-in-up" id="discount-slider">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
                <Tag size={18} className="text-rose-400" />
              </div>
              <h2 className="text-lg font-bold text-slate-100">Final Discount</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-black text-rose-400 tabular-nums">{discountPct}%</span>
              {quoteResult && discountPct > 0 && (
                <span className="text-sm font-bold text-rose-400/70">−{fmt(quoteResult.discount_amount)}</span>
              )}
            </div>
          </div>
          <input
            id="discount-range"
            type="range"
            min="0"
            max="30"
            step="1"
            value={discountPct}
            onChange={(e) => setDiscountPct(Number(e.target.value))}
            className="custom-slider discount-slider"
          />
          <div className="flex justify-between mt-2 text-xs text-slate-500 font-mono">
            <span>0%</span>
            <span>5%</span>
            <span>10%</span>
            <span>15%</span>
            <span>20%</span>
            <span>25%</span>
            <span>30%</span>
          </div>
          <p className="text-xs text-slate-600 mt-2">Applied after margin — slashes the final bid price</p>
        </section>
      </div>

      {/* ── DUAL QUOTE MODE (NO EXPLICIT FRAME TYPE) ───────────── */}
      {quoteMode === "dual" && dualBrandQuotes.length > 0 && (
        <section className="glass-card p-6 mb-6 fade-in-up border-sky-500/20" id="dual-brand-options">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center">
              <Layers size={18} className="text-sky-400" />
            </div>
            <h2 className="text-lg font-bold text-slate-100">Frame Type Not Explicit — Both Quotes Prepared</h2>
            <span className="badge badge-sky ml-2">Step 2.5</span>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            The uploaded plans did not explicitly state framed vs frameless. Review both totals and choose the bid path.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dualBrandQuotes.map((opt) => (
              <div key={opt.brand} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="text-sm font-bold text-slate-100">{opt.brand}</div>
                    <div className="text-xs text-slate-500">Finish: {opt.finish}</div>
                  </div>
                  <span className={`badge ${opt.error ? "badge-rose" : "badge-emerald"}`}>
                    {opt.error ? "Error" : "Ready"}
                  </span>
                </div>

                {opt.error ? (
                  <div className="text-xs text-rose-300">{opt.error}</div>
                ) : (
                  <>
                    <div className="text-2xl font-black text-amber-400 tabular-nums">{fmt(opt.result.grand_total)}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {opt.result.box_count} boxes • list {fmt(opt.result.total_list_price)}
                    </div>
                    <button
                      onClick={() => {
                        setQuoteMode("single");
                        applyBrandFinishSelection(opt.brand, opt.finish);
                        setQuoteResult(opt.result);
                        setDualBrandQuotes([]);
                      }}
                      className="btn-primary mt-3"
                    >
                      Use {opt.brand}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── GRAND TOTAL HERO ──────────────────────────────────── */}
      {quoteResult && (
        <section className="glass-card p-6 mb-6 fade-in-up border-amber-500/20 relative overflow-hidden" id="grand-total-hero">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 via-transparent to-emerald-500/5" />


          <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 flex items-center justify-center pulse-glow">
                <DollarSign size={28} className="text-amber-400" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Grand Total Bid</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-[0.2em] mt-1">Step 4 • Final Quote</div>
                <div className="text-4xl sm:text-5xl font-black text-amber-400 tabular-nums tracking-tight">
                  {fmt(quoteResult.grand_total)}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span className="badge badge-amber">{margin}% margin</span>
              {discountPct > 0 && <span className="badge badge-rose">{discountPct}% discount</span>}
              <span className="badge badge-sky">{quoteResult.box_count} boxes</span>
              {includeInstall && <span className="badge badge-emerald">Install incl.</span>}
            </div>
          </div>
        </section>
      )}

      {/* ── COST BREAKDOWN ────────────────────────────────────── */}
      {quoteResult && (
        <section className="mb-6 fade-in-up" id="cost-breakdown">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <BarChart3 size={18} className="text-emerald-400" />
            </div>
            <h2 className="text-lg font-bold text-slate-100">AI Extraction Receipt (Cabinet Totals)</h2>
            <span className="badge badge-emerald ml-2">Step 2</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
            <StatCard
              icon={<DollarSign size={18} />}
              label="List Price Total"
              value={fmt(quoteResult.total_list_price)}
              color="slate"
            />
            <StatCard
              icon={<TrendingUp size={18} />}
              label="Cabinet Revenue"
              value={fmt(quoteResult.cabinet_revenue)}
              sub={`List × ${factor}`}
              color="amber"
            />
            <StatCard
              icon={<Hammer size={18} />}
              label="Build Cost"
              value={fmt(quoteResult.build_cost)}
              sub={`${quoteResult.box_count} × $${buildRate}`}
              color="sky"
            />
            <StatCard
              icon={<Truck size={18} />}
              label="Shipping"
              value={fmt(quoteResult.shipping_cost)}
              sub={`$${shippingRate} flat`}
              color="purple"
            />
            <StatCard
              icon={<Wrench size={18} />}
              label="Installation"
              value={fmt(quoteResult.install_cost)}
              sub={includeInstall ? `${quoteResult.box_count} × $${installRate}` : "Not included"}
              color="rose"
            />
            <StatCard
              icon={<Percent size={18} />}
              label="Bid Pre-Discount"
              value={fmt(quoteResult.bid_price)}
              sub={`@ ${margin}% margin`}
              color="amber"
            />
            {discountPct > 0 ? (
              <StatCard
                icon={<Tag size={18} />}
                label="Discount"
                value={`−${fmt(quoteResult.discount_amount)}`}
                sub={`${discountPct}% off bid`}
                color="rose"
              />
            ) : (
              <div className="stat-card border-amber-500/30 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-emerald-500/5" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 text-amber-400">
                    <Package size={18} />
                    <span className="text-xs font-semibold uppercase tracking-wider">Grand Total</span>
                  </div>
                  <div className="stat-value text-amber-400 mt-2">
                    {fmt(quoteResult.grand_total)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    @ {margin}% margin
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── LINE ITEMS TABLE ──────────────────────────────────── */}
      {quoteResult?.lines?.length > 0 && (
        <section className="glass-card p-6 mb-6 fade-in-up" id="line-items">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center">
                <FileText size={18} className="text-sky-400" />
              </div>
              <h2 className="text-lg font-bold text-slate-100">Line Items</h2>
              <span className="badge badge-sky ml-2">
                {quoteResult.lines.length} items
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="badge badge-emerald">
                {quoteResult.lines.filter((l) => l.found).length} found
              </span>
              {quoteResult.lines.some((l) => !l.found) && (
                <span className="badge badge-rose">
                  {quoteResult.lines.filter((l) => !l.found).length} missing
                </span>
              )}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800/50" style={{ maxHeight: "400px", overflowY: "auto" }}>
            <table className="quote-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Resolved</th>
                  <th>Qty</th>
                  <th>Unit Price</th>
                  <th>Line Total</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {quoteResult.lines.map((line, i) => (
                  <tr key={i} className={line.found ? "" : "not-found"}>
                    <td className="font-bold text-slate-100">{line.sku}</td>
                    <td>
                      {line.resolved_sku !== line.sku ? (
                        <span className="text-amber-400">{line.resolved_sku}</span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td>{line.quantity}</td>
                    <td>{fmt(line.unit_price)}</td>
                    <td className="text-emerald-400 font-semibold">{fmt(line.line_total)}</td>
                    <td>
                      {line.is_box ? (
                        <span className="badge badge-amber">Box</span>
                      ) : (
                        <span className="badge badge-sky">Acc</span>
                      )}
                    </td>
                    <td>
                      {line.found ? (
                        <CheckCircle2 size={16} className="text-emerald-400" />
                      ) : (
                        <AlertCircle size={16} className="text-rose-400" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer className="text-center py-8 text-xs text-slate-600">
        <p>
          Cabinet Bidding Dashboard • Mike-Logic™ Engine •{" "}
          Factor: {factor} • Build: ${buildRate}/box • Ship: ${shippingRate} • Install: ${installRate}/box
        </p>
        <p className="mt-1">Built for professional contractors</p>
      </footer>

      {/* Loading overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
          <div className="glass-card p-8 flex flex-col items-center gap-4">
            <div className="spinner" style={{ width: 32, height: 32 }} />
            <span className="text-slate-300 font-medium">Calculating quote...</span>
          </div>
        </div>
      )}
    </main>
  );
}

// ── Stat Card Component ──────────────────────────────────────────
function StatCard({ icon, label, value, sub, color }) {
  const colorMap = {
    amber: "text-amber-400",
    emerald: "text-emerald-400",
    sky: "text-sky-400",
    rose: "text-rose-400",
    purple: "text-purple-400",
    slate: "text-slate-400",
  };
  const iconColor = colorMap[color] || "text-slate-400";

  return (
    <div className="stat-card">
      <div className={`flex items-center gap-2 ${iconColor}`}>
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className={`stat-value ${iconColor}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
