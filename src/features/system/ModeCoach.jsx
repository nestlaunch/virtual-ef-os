import { useVirtualOS } from "../../state/VirtualOSContext";

const MODE_COPY = {
  learn: {
    label: "Learn",
    title: "Guided mode",
    body: "Look for the highlighted safest or most accurate option.",
  },
  practice: {
    label: "Practice",
    title: "Correct option required",
    body: "The task should only progress when the correct choice is made.",
  },
  assessment: {
    label: "Assessment",
    title: "Free mode",
    body: "No blocking guidance. Work as you normally would.",
  },
  free: {
    label: "Free",
    title: "Explore freely",
    body: "No task prompts or blocking. Use any app freely.",
  },
};

const LEARN_APP_COPY = {
  sms: {
    title: "Messages tour",
    body: "Tap an unread message row. Read the sender, date, time, and clinic location before moving to Calendar.",
    focus: "Highlighted area: message list row and appointment text.",
  },
  calendar: {
    title: "Calendar tour",
    body: "Tap the correct date, enter a clear title, check start/end time, then save. Use existing event chips to edit.",
    focus: "Highlighted area: date cell, title field, time fields, save button.",
  },
  whatsapp: {
    title: "WhatsApp tour",
    body: "Open the chat, read the sender's message, type a reply, then tap Send.",
    focus: "Highlighted area: chat row, message thread, text box, send button.",
  },
  maps: {
    title: "Maps tour",
    body: "Choose current location, choose destination, select travel mode, then tap Directions to see the route and duration.",
    focus: "Highlighted area: location fields, route mode, directions button, route duration.",
  },
  bank: {
    title: "Bank tour",
    body: "Check the visible balance, start a payment, review payee and amount, then approve the simulated payment.",
    focus: "Highlighted area: balance, transfer button, payment form, review screen.",
  },
  home: {
    title: "Home screen tour",
    body: "Choose the app that matches the task. Use Home when you need to switch apps.",
    focus: "Highlighted area: app icons.",
  },
};

export function ModeCoach() {
  const { state } = useVirtualOS();
  const effectiveMode = state.session.currentUserId
    ? state.session.userModes[state.session.currentUserId] || state.session.mode
    : state.session.mode;
  const item = effectiveMode === "learn"
    ? { ...MODE_COPY.learn, ...(LEARN_APP_COPY[state.currentApp] || LEARN_APP_COPY.home) }
    : MODE_COPY[effectiveMode] || MODE_COPY.practice;

  if (effectiveMode === "assessment" || effectiveMode === "free") {
    return null;
  }

  return (
    <aside className={`mode-coach ${effectiveMode}`}>
      <span>{item.label}</span>
      <strong>{item.title}</strong>
      <p>{item.body}</p>
      {item.focus ? <em>{item.focus}</em> : null}
    </aside>
  );
}
