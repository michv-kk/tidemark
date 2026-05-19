"use client";

import { useEffect, useRef, memo } from "react";

interface Props {
  symbol?: string;       // e.g. "BINANCE:BTCUSDT"
  interval?: string;     // "D" | "W" | "60" | "15" | "5"
  height?: number;
  theme?: "dark" | "light";
  studies?: string[];
}

function TradingViewWidgetInner({
  symbol = "BINANCE:BTCUSDT",
  interval = "D",
  height = 500,
  theme = "dark",
  studies = [],
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const key = `${symbol}-${interval}`;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";

    const widgetContainer = document.createElement("div");
    widgetContainer.className = "tradingview-widget-container__widget";
    widgetContainer.style.height = `${height - 32}px`;
    widgetContainer.style.width = "100%";
    container.appendChild(widgetContainer);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: false,
      width: "100%",
      height: height - 32,
      symbol,
      interval,
      timezone: "Etc/UTC",
      theme,
      style: "1",
      locale: "en",
      backgroundColor: "rgba(8, 8, 16, 0)",
      gridColor: "rgba(255, 255, 255, 0.04)",
      hide_top_toolbar: false,
      hide_legend: false,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      save_image: false,
      calendar: false,
      studies,
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);

    return () => {
      if (container) container.innerHTML = "";
    };
  }, [key, height, theme, studies]);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container w-full overflow-hidden rounded-xl"
      style={{ height }}
    />
  );
}

export const TradingViewWidget = memo(TradingViewWidgetInner);

// Mini price-only widget (no chart, just ticker)
export function TradingViewMiniSymbol({ symbol = "BTCUSDT" }: { symbol?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-single-quote.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol,
      width: "100%",
      locale: "en",
      colorTheme: "dark",
      isTransparent: true,
      largeChartUrl: "",
    });
    container.appendChild(script);
    return () => { if (container) container.innerHTML = ""; };
  }, [symbol]);

  return <div ref={containerRef} className="tradingview-widget-container w-full" />;
}
