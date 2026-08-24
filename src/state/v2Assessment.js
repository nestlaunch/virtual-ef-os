import { getDoctorAppointmentDateLabel, getDoctorAppointmentDetailsLabel } from "../features/taskAnswerChecks.js";

export const SESSION_MODES = [
  {
    id: "learn",
    label: "Learn",
    description: "Guide the patient toward the correct option with visible cues.",
  },
  {
    id: "practice",
    label: "Practice",
    description: "Only allow progression after the correct option is selected.",
  },
  {
    id: "assessment",
    label: "Assessment",
    description: "Independent task performance with no blocking guidance; observe and score natural errors.",
  },
  {
    id: "free",
    label: "Free",
    description: "Unrestricted exploration with no task framing, blocking, or guidance.",
  },
];

export const APP_CATALOG = [
  {
    id: "messages",
    label: "Messages",
    currentApp: "sms",
    purpose: "Read formal appointment information and identify key details.",
    domains: ["attention", "working memory", "information extraction"],
  },
  {
    id: "calendar",
    label: "Calendar",
    currentApp: "calendar",
    purpose: "Enter appointments accurately while following scheduling rules.",
    domains: ["sequencing", "planning", "error awareness"],
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    currentApp: "whatsapp",
    purpose: "Manage informal social scheduling and respond appropriately.",
    domains: ["cognitive flexibility", "social judgement", "task persistence"],
  },
  {
    id: "maps",
    label: "Maps",
    currentApp: "maps",
    purpose: "Plan a community route using location, timing, and travel mode.",
    domains: ["problem solving", "visual scanning", "processing speed"],
  },
  {
    id: "bank",
    label: "Bank",
    currentApp: "bank",
    purpose: "Check balance and complete a simulated payment using exact recipient and amount details.",
    domains: ["information extraction", "self-monitoring", "task execution"],
  },
  {
    id: "singpass",
    label: "Singpass",
    currentApp: "singpass",
    purpose: "Review and approve sensitive identity or payment requests only when details match.",
    domains: ["self-monitoring", "information extraction", "security judgement"],
  },
];

export const LEARN_APP_CATALOG = [
  {
    id: "home-navigation",
    label: "Home Navigation",
    currentApp: "home",
    purpose: "Understand app purposes, status information, and Android navigation controls.",
    domains: ["orientation", "visual scanning", "navigation"],
  },
  {
    id: "internet-connection",
    label: "Connect to the Internet",
    currentApp: "connectivity",
    purpose: "Understand why internet is needed, recognise an offline message, and restore a connection.",
    domains: ["problem solving", "error recognition", "sequencing"],
  },
  ...APP_CATALOG,
];

export const DEFAULT_USER_ACCOUNTS = [
  { id: "user-a", alias: "Calm Panda", pin: "1842" },
  { id: "user-b", alias: "Bright Otter", pin: "5093" },
  { id: "user-c", alias: "Kind Tiger", pin: "7316" },
  { id: "user-d", alias: "Swift Koala", pin: "4268" },
  { id: "user-e", alias: "Gentle Falcon", pin: "9051" },
  { id: "user-f", alias: "Clever Dolphin", pin: "2674" },
];

export const ALIAS_POOL = [
  "Calm Panda",
  "Bright Otter",
  "Kind Tiger",
  "Swift Koala",
  "Gentle Falcon",
  "Clever Dolphin",
  "Brave Turtle",
  "Quiet Lynx",
  "Sunny Penguin",
  "Steady Eagle",
  "Happy Seal",
  "Wise Fox",
];

export const ALIAS_EMOJI = {
  "Calm Panda": "🐼",
  "Bright Otter": "🦦",
  "Kind Tiger": "🐯",
  "Swift Koala": "🐨",
  "Gentle Falcon": "🦅",
  "Clever Dolphin": "🐬",
  "Brave Turtle": "🐢",
  "Quiet Lynx": "🐱",
  "Sunny Penguin": "🐧",
  "Steady Eagle": "🦅",
  "Happy Seal": "🦭",
  "Wise Fox": "🦊",
};

export function formatAlias(alias) {
  return `${ALIAS_EMOJI[alias] || "👤"} ${alias}`;
}

export const SCENARIO_LIBRARY = [
  {
    id: "single-messages-details",
    title: "Read Doctor Appointment",
    complexity: "Single app",
    apps: ["messages"],
    mode: "practice",
    description: "Open the Doctor SMS and identify the appointment date, time, and location.",
    successCriteria: [
      "Open Messages",
      "Open Doctor message",
      `Identify ${getDoctorAppointmentDetailsLabel()}`,
    ],
  },
  {
    id: "single-calendar-entry",
    title: "Add Clinic Appointment",
    complexity: "Single app",
    apps: ["calendar"],
    mode: "practice",
    description: "Add a clinic appointment into Calendar with a provided title, date, and time.",
    successCriteria: [
      `Select ${getDoctorAppointmentDateLabel()}`,
      "Enter title: Psychiatry appointment",
      "Set 3:00 PM to 4:00 PM",
      "Save the event",
    ],
  },
  {
    id: "single-whatsapp-reply",
    title: "Reply to Dinner Message",
    complexity: "Single app",
    apps: ["whatsapp"],
    mode: "practice",
    description: "Open Family Group and send a clear reply using the chat box.",
    successCriteria: [
      "Open Family Group",
      "Type: Yes, I can attend dinner.",
      "Send the message",
    ],
  },
  {
    id: "single-maps-route",
    title: "Route to Clinic B",
    complexity: "Single app",
    apps: ["maps"],
    mode: "practice",
    description: "Plan a route from Home to Clinic B and read the travel duration.",
    successCriteria: [
      "Set start: Home",
      "Set destination: Clinic B",
      "Choose Public transport",
      "Tap Directions and read duration",
    ],
  },
  {
    id: "single-bank-payment",
    title: "Pay Clinic Bill",
    complexity: "Single app",
    apps: ["bank"],
    mode: "practice",
    description: "Check balance, make a simulated payment to Hougang Polyclinic, then approve it in Singpass.",
    successCriteria: [
      "Check total balance: S$2262.60",
      "Choose Hougang Polyclinic",
      "Enter amount: 25.00",
      "Enter purpose: Clinic bill",
      "Open Singpass",
      "Match recipient and amount",
      "Approve payment in Singpass",
    ],
  },
  {
    id: "two-sms-calendar",
    title: "SMS Appointment to Calendar",
    complexity: "Two apps",
    apps: ["messages", "calendar"],
    mode: "practice",
    description: "Use the Doctor SMS as the source and create the matching Calendar appointment.",
    successCriteria: [
      "Read Doctor SMS",
      "Open Calendar",
      "Enter title: Psychiatry appointment",
      `Set ${getDoctorAppointmentDateLabel()}, 3:00 PM to 4:00 PM`,
      "Save event",
    ],
  },
  {
    id: "two-whatsapp-calendar",
    title: "Dinner Reply and Calendar",
    complexity: "Two apps",
    apps: ["whatsapp", "calendar"],
    mode: "practice",
    description: "Reply to Family Group and add the dinner plan to Calendar.",
    successCriteria: [
      "Open Family Group",
      "Send: Yes, I can attend dinner.",
      "Open Calendar",
      `Add Dinner on ${getDoctorAppointmentDateLabel()}, 6:30 PM to 8:00 PM`,
    ],
  },
  {
    id: "two-calendar-maps",
    title: "Calendar Event to Maps",
    complexity: "Two apps",
    apps: ["calendar", "maps"],
    mode: "practice",
    description: "Check a clinic appointment in Calendar, then plan the route in Maps.",
    successCriteria: [
      "Open Calendar appointment",
      "Read location: Clinic B",
      "Open Maps",
      "Set Home to Clinic B",
      "Read travel duration",
    ],
  },
  {
    id: "multi-clinic-day",
    title: "Clinic Appointment Day",
    complexity: "Multi-app",
    apps: ["messages", "calendar", "maps"],
    mode: "practice",
    description: "Read appointment SMS, save it in Calendar, then check travel time to the clinic.",
    successCriteria: [
      "Read Doctor SMS",
      "Save appointment to Calendar",
      "Plan route from Home to Clinic B",
      "Read route duration",
    ],
  },
  {
    id: "multi-social-clinic",
    title: "Social Plan and Clinic Appointment",
    complexity: "Multi-app",
    apps: ["messages", "calendar", "whatsapp"],
    mode: "practice",
    description: "Save a clinic appointment, then reply to a social message without losing the clinic task.",
    successCriteria: [
      "Read Doctor SMS",
      "Save Psychiatry appointment",
      "Open Family Group",
      "Reply: Yes, I can attend dinner.",
    ],
  },
  {
    id: "multi-payment-appointment",
    title: "Payment and Appointment Check",
    complexity: "Multi-app",
    apps: ["messages", "calendar", "bank", "singpass"],
    mode: "practice",
    description: "Check appointment information, confirm Calendar, and complete a simulated clinic payment.",
    successCriteria: [
      "Read appointment message",
      "Check Calendar appointment",
      "Open Bank",
      "Pay Hougang Polyclinic S$25.00",
      "Review before approving",
      "Approve payment in Singpass",
    ],
  },
];

export const CHECKLIST_ITEMS = [
  {
    id: "understands_goal",
    label: "Understands task goal",
    domain: "working memory",
    anchor: "Can state or demonstrate what the digital task requires.",
  },
  {
    id: "locates_app",
    label: "Locates correct app",
    domain: "visual scanning",
    anchor: "Finds and opens the relevant simulated app without excessive trial and error.",
  },
  {
    id: "extracts_information",
    label: "Extracts key information",
    domain: "attention",
    anchor: "Identifies date, time, recipient, destination, amount, or warning cues as relevant.",
  },
  {
    id: "sequences_steps",
    label: "Sequences steps",
    domain: "sequencing",
    anchor: "Completes actions in a logical order without losing the task goal.",
  },
  {
    id: "checks_before_confirming",
    label: "Checks before confirming",
    domain: "self-monitoring",
    anchor: "Reviews sensitive details before saving, sending, approving, or confirming.",
  },
  {
    id: "recognises_risk",
    label: "Reviews sensitive information",
    domain: "self-monitoring",
    anchor: "Checks recipient, amount, date, time, or location before completing the action.",
  },
  {
    id: "recovers_from_error",
    label: "Recovers from error",
    domain: "problem solving",
    anchor: "Corrects mistakes or changes strategy after feedback.",
  },
];

export const SCORE_LABELS = {
  0: "Unable",
  1: "Full assist",
  2: "Partial cues",
  3: "Independent with delay/errors",
  4: "Independent and safe",
};

export function createInitialChecklistScores() {
  return CHECKLIST_ITEMS.reduce((acc, item) => {
    acc[item.id] = null;
    return acc;
  }, {});
}

export function getChecklistScoresForAccount(state, accountId) {
  if (!accountId) {
    return createInitialChecklistScores();
  }
  return {
    ...createInitialChecklistScores(),
    ...(state?.checklistScoresByAccount?.[accountId] || {}),
  };
}
