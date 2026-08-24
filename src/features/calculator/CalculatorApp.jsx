import { useVirtualOS } from "../../state/VirtualOSContext";

const KEYS = ["AC", "⌫", "%", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "0", ".", "=",];

function calculate(expression) {
  const safe = expression.replaceAll("×", "*").replaceAll("÷", "/").replaceAll("−", "-");
  if (!/^[0-9+\-*/.% ]+$/.test(safe)) return "Error";
  try {
    const result = Function(`"use strict"; return (${safe})`)();
    return Number.isFinite(result) ? String(Math.round(result * 1e10) / 1e10) : "Cannot divide by zero";
  } catch { return "Error"; }
}

export function CalculatorApp() {
  const { state, setCalculator } = useVirtualOS();
  const calculator = state.calculator;

  function press(key) {
    if (key === "AC") return setCalculator({ expression: "", display: "0" });
    if (key === "⌫") {
      const expression = calculator.expression.slice(0, -1);
      return setCalculator({ expression, display: expression || "0" });
    }
    if (key === "=") {
      if (!calculator.expression) return;
      const result = calculate(calculator.expression);
      return setCalculator({ display: result, expression: result === "Error" || result.startsWith("Cannot") ? "" : result, history: [{ expression: calculator.expression, result }, ...(calculator.history || [])].slice(0, 8) });
    }
    const expression = `${calculator.expression}${key}`;
    setCalculator({ expression, display: expression });
  }

  return <div className="calculator-app" tabIndex="0" onKeyDown={(event) => { const map = { Enter: "=", Backspace: "⌫", Escape: "AC", "*": "×", "/": "÷", "-": "−" }; const key = map[event.key] || event.key; if (KEYS.includes(key)) press(key); }}><header><strong>Calculator</strong><button type="button" onClick={() => setCalculator({ history: [] })}>Clear history</button></header><section className="calculator-display"><small>{calculator.expression && calculator.display !== calculator.expression ? calculator.expression : ""}</small><output>{calculator.display}</output></section><div className="calculator-keys">{KEYS.map((key) => <button type="button" key={key} className={/[÷×−+=%]/.test(key) ? "operator" : key === "AC" ? "clear" : ""} onClick={() => press(key)}>{key}</button>)}</div>{calculator.history?.length ? <section className="calculator-history"><h3>History</h3>{calculator.history.map((item, index) => <p key={`${item.expression}-${index}`}><span>{item.expression}</span><strong>{item.result}</strong></p>)}</section> : null}</div>;
}
