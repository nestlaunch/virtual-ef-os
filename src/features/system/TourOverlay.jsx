import { useVirtualOS } from "../../state/VirtualOSContext";

const TOUR_STEPS = [
  {
    app: "home",
    title: "Home Screen",
    description: "This is the launcher. Open Calendar, Messages, WhatsApp, and Settings from here.",
  },
  {
    app: "calendar",
    title: "Calendar",
    description: "Tap a date to add/edit appointments. Use month arrows to move between months.",
  },
  {
    app: "sms",
    title: "Messages",
    description: "Read formal appointment notices (doctor, polyclinic) and schedule them in Calendar.",
  },
  {
    app: "whatsapp",
    title: "WhatsApp",
    description: "Reply naturally to friends, resolve timing conflicts, and confirm meetings.",
  },
  {
    app: "settings",
    title: "Settings / Evaluation",
    description: "Review rules and therapist checklist. Signal completion when done.",
  },
];

export function TourOverlay() {
  const { state, nextTourStep, endTour } = useVirtualOS();

  if (!state.tour.active) {
    return null;
  }

  const step = TOUR_STEPS[state.tour.step] || TOUR_STEPS[0];
  const isLast = state.tour.step === TOUR_STEPS.length - 1;

  return (
    <div className="tour-overlay">
      <div className="tour-card">
        <p className="tour-progress">Step {state.tour.step + 1} / {TOUR_STEPS.length}</p>
        <h3>{step.title}</h3>
        <p>{step.description}</p>
        <div className="tour-actions">
          <button type="button" className="tour-btn ghost" onClick={endTour}>Close</button>
          <button type="button" className="tour-btn" onClick={nextTourStep}>{isLast ? "Finish" : "Next"}</button>
        </div>
      </div>
    </div>
  );
}
