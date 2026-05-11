import { useState } from "react";
import { useVirtualOS } from "../../state/VirtualOSContext";

const STEPS = [
  {
    title: "Assessment Goal",
    subtitle: "Manage conflicting schedules accurately",
    visual: "GOAL",
    points: [
      "Capture key appointments from Messages and WhatsApp.",
      "Enter them into Calendar with correct date and time.",
      "Respond naturally while resolving clashes.",
    ],
  },
  {
    title: "Core Tasks",
    subtitle: "What you need to complete",
    visual: "TASK",
    points: [
      "Doctor + Polyclinic appointments entered.",
      "Friend meetings handled and confirmed.",
      "Rule violations avoided where possible.",
    ],
  },
  {
    title: "How You Are Rated",
    subtitle: "Therapist checklist + timing metrics",
    visual: "SCORE",
    points: [
      "Accuracy: correct day/time and completion quality.",
      "Errors: omissions, location mistakes, incomplete entries.",
      "Efficiency: planning time and total completion time.",
    ],
  },
  {
    title: "Ready to Begin",
    subtitle: "Choose your mode",
    visual: "START",
    points: [
      "START: Begin immediately.",
      "TOUR: Guided walkthrough of every app.",
      "You can return to evaluation in Settings anytime.",
    ],
  },
];

export function InstructionPage() {
  const { startAssessment, startTour } = useVirtualOS();
  const [step, setStep] = useState(0);
  const item = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="instruction-page">
      <div className="instruction-progress">
        {STEPS.map((s, idx) => (
          <span key={s.title} className={`progress-dot ${idx === step ? "active" : ""}`} />
        ))}
      </div>

      <div className="instruction-hero">
        <span className="instruction-visual">{item.visual}</span>
        <div>
          <h1>{item.title}</h1>
          <p>{item.subtitle}</p>
        </div>
      </div>

      <div className="instruction-cards">
        {item.points.map((point) => (
          <div key={point} className="instruction-card">
            <span className="check">OK</span>
            <span>{point}</span>
          </div>
        ))}
      </div>

      <div className="instruction-nav">
        <button type="button" className="instruction-btn back" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          Back
        </button>
        {!isLast ? (
          <button type="button" className="instruction-btn next" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
            Next
          </button>
        ) : (
          <div className="instruction-actions">
            <button type="button" className="instruction-btn start" onClick={startAssessment}>START</button>
            <button type="button" className="instruction-btn tour" onClick={startTour}>TOUR</button>
          </div>
        )}
      </div>
    </div>
  );
}
