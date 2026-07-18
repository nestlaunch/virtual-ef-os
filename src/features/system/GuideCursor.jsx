import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import guideCursor from "../../assets/guide-cursor.svg";

const CURSOR_SIZE = 58;
const TIP_OFFSET = {
  x: CURSOR_SIZE * (25 / 96),
  y: CURSOR_SIZE * (16.5 / 96),
};

function getVisibleRect(node) {
  if (!node || typeof node.getBoundingClientRect !== "function") {
    return null;
  }
  const rect = node.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  const style = window.getComputedStyle(node);
  if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) {
    return null;
  }
  return rect;
}

function getUnionRect(rects) {
  if (!rects.length) {
    return null;
  }
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function getPointForRect(rect, mode = "center") {
  if (!rect) {
    return null;
  }
  if (mode === "top-right") {
    return {
      x: rect.right - Math.min(18, rect.width / 2),
      y: rect.top + Math.min(18, rect.height / 2),
    };
  }
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

export function getGuideTargetSelectors(step, currentApp) {
  if (!step) {
    return [];
  }
  const id = step.id || "";
  const label = `${step.label || ""} ${step.question || ""}`.toLowerCase();

  if (id.includes("open-messages") || id.includes("open-sms")) return ['[data-learn-target="home-app-messages"]'];
  if (id.includes("open-calendar")) return ['[data-learn-target="home-app-calendar"]'];
  if (id.includes("open-whatsapp")) return ['[data-learn-target="home-app-whatsapp"]'];
  if (id.includes("open-maps")) return ['[data-learn-target="home-app-maps"]'];
  if (id.includes("open-bank")) return ['[data-learn-target="home-app-bank"]'];
  if (id.includes("go-home")) return ['[data-learn-target="nav-home"]'];
  if (id.includes("open-doctor") || id === "open-message") return ['[data-learn-target="sms-doctor-row"]'];
  if (id.includes("read-details")) return ['[data-learn-target="sms-doctor-message"]'];
  if (id.includes("choose-date")) return ['[data-learn-target="calendar-single-date"][data-calendar-date="target"]', ".day-cell.selected", ".day-cell.today"];
  if (id.includes("enter-title") || id.includes("calendar-title")) return [".title-input"];
  if (id.includes("date-time") || id.includes("calendar-time")) return [".date-wheel-fields", ".time-edit"];
  if (id.includes("calendar-save") || id === "save-entry") return [".save-btn"];
  if (id.includes("open-chat")) return ['[data-learn-target="wa-dinner-row"]', '.wa-row[data-thread-id="family"]'];
  if (id.includes("type-reply")) return [".wa-input-row input"];
  if (id.includes("send-reply")) return [".wa-input-row button"];
  if (id.includes("maps-start") || id === "choose-start") return [".maps-field:first-of-type select"];
  if (id.includes("maps-destination") || id === "choose-destination") return [".maps-field:nth-of-type(2) select"];
  if (id.includes("travel-mode") || id === "select-mode") return [".maps-route-options button"];
  if (id.includes("show-route")) return [".maps-directions-btn", ".maps-route-summary"];
  if (id === "login") return [".bank-primary-btn"];
  if (id.includes("balance")) return [".bank-balance-card", ".bank-account-card"];
  if (id.includes("start-payment")) return [".bank-quick-actions button"];
  if (id.includes("review-details")) return [".bank-payment-review", ".bank-transfer-card"];
  if (id.includes("complete-payment")) return [".bank-primary-btn", '[data-learn-target="home-app-singpass"]'];
  if (id.includes("singpass-details")) return ['[data-learn-target="singpass-approval-card"]', ".singpass-approval-hero"];
  if (id.includes("approve-singpass")) return ['[data-learn-target="singpass-approve"]'];
  if (label.includes("answer") || label.includes("enter")) return [".practice-answer-box", ".assessment-answer-box"];
  if (currentApp === "home") return ['[data-learn-target="home-apps"]'];
  return [];
}

export function GuideCursor({ cardRef, selectors = [], targetMode = "center", replayKey = "", autoPlay = true, interactive = true }) {
  const [phase, setPhase] = useState("hidden");
  const [position, setPosition] = useState(null);
  const [runId, setRunId] = useState(0);
  const timeoutRef = useRef(null);
  const targetSelectors = useMemo(() => selectors.filter(Boolean), [selectors]);

  function measure() {
    const cardRect = getVisibleRect(cardRef?.current);
    if (!cardRect || targetSelectors.length === 0) {
      return null;
    }
    const rects = targetSelectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .map(getVisibleRect)
      .filter(Boolean);
    const targetRect = getUnionRect(rects);
    const targetPoint = getPointForRect(targetRect, targetMode);
    if (!targetPoint) {
      return null;
    }
    return {
      park: {
        x: cardRect.right - CURSOR_SIZE - 12,
        y: cardRect.top + 12,
      },
      target: {
        x: targetPoint.x - TIP_OFFSET.x,
        y: targetPoint.y - TIP_OFFSET.y,
      },
    };
  }

  function park() {
    window.clearTimeout(timeoutRef.current);
    const next = measure();
    if (!next) {
      setPhase("hidden");
      setPosition(null);
      return;
    }
    setPosition(next.park);
    setPhase("parked");
  }

  function play() {
    window.clearTimeout(timeoutRef.current);
    const next = measure();
    if (!next) {
      setPhase("hidden");
      setPosition(null);
      return;
    }
    setPosition(next.park);
    setPhase("moving");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setPosition(next.target));
    });
    timeoutRef.current = window.setTimeout(() => {
      const parked = measure();
      setPosition(parked?.park || next.park);
      setPhase("parked");
    }, 1400);
  }

  useEffect(() => {
    setRunId((id) => id + 1);
  }, [targetSelectors.join("|"), replayKey]);

  useEffect(() => {
    if (!runId) {
      return undefined;
    }
    const timer = window.setTimeout(autoPlay ? play : park, 80);
    const onResize = () => {
      if (phase === "parked") {
        const next = measure();
        if (next) {
          setPosition(next.park);
        }
      }
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(timeoutRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [runId, autoPlay]);

  if (!position || phase === "hidden") {
    return null;
  }

  const cursorStyle = {
    "--guide-x": `${position.x}px`,
    "--guide-y": `${position.y}px`,
  };
  return createPortal(
    interactive ? (
      <button
        type="button"
        className={`guide-cursor ${phase}`}
        data-support-ui="true"
        style={cursorStyle}
        aria-label="Show me where to look"
        title="Show me"
        onClick={play}
      >
        <img src={guideCursor} alt="" aria-hidden="true" />
      </button>
    ) : (
      <div className={`guide-cursor ${phase}`} data-support-ui="true" style={cursorStyle} aria-hidden="true">
        <img src={guideCursor} alt="" />
      </div>
    ),
    document.body
  );
}
