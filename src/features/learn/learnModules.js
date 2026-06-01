import { formalThreads } from "../../state/seedData";
import { LEARN_APP_CATALOG } from "../../state/v2Assessment";
import { getDoctorAppointmentDateLabel, getDoctorAppointmentDateParts, getDoctorAppointmentDetailsLabel } from "../taskAnswerChecks";

export const LEARN_SEQUENCE = LEARN_APP_CATALOG.map((app) => app.currentApp);

const doctorAppointment = formalThreads.find((thread) => thread.id === "doctor")?.messages.find((message) => message.appointment)?.appointment;
const bankTotalBalance = "S$2262.60";
const doctorDateParts = getDoctorAppointmentDateParts();

function formatLearnAppointment(appointment, timeOffset = 0, dayOffset = 0) {
  if (!appointment) {
    return "";
  }
  const date = new Date(appointment.year, appointment.month, appointment.date + dayOffset);
  const dateText = date.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
  const minutes = appointment.start + timeOffset;
  const h24 = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, "0");
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return `${dateText} ${String(h12).padStart(2, "0")}:${mm} ${suffix}`;
}

export const LEARN_MODULES = {
  home: {
    title: "Home Navigation target",
    steps: [
      {
        label: "Check status bar",
        selectors: ['[data-learn-target="status-battery"]', '[data-learn-target="status-signal"]'],
        instruction: "Look at the top-right status area. It shows mobile signal and battery percentage.",
        question: "What battery percentage is shown?",
        answers: [
          { label: "61%", correct: true },
          { label: "5G", correct: false },
          { label: "16%", correct: false },
        ],
      },
      {
        label: "Know app purposes",
        selectors: ['[data-learn-target="home-apps"]', ".home-app"],
        instruction: "Scan the app icons. Each app has a different purpose before you open it.",
        question: "Which app is used to save appointments?",
        answers: [
          { label: "Calendar", correct: true },
          { label: "Maps", correct: false },
          { label: "Bank", correct: false },
        ],
      },
      {
        label: "Back button",
        selectors: ['[data-learn-target="nav-back"]'],
        instruction: "Tap the Back button. It is used to return to the previous screen.",
        advanceOn: "click",
      },
      {
        label: "Home button",
        selectors: ['[data-learn-target="nav-home"]'],
        instruction: "Tap the Home button. It brings you back to the app grid.",
        advanceOn: "click",
      },
      {
        label: "Recent apps",
        selectors: ['[data-learn-target="nav-tabs"]'],
        instruction: "Tap the Recent apps button to see open apps, then tap it again if you need to close the switcher.",
        advanceOn: "click",
      },
    ],
  },
  sms: {
    title: "Messages target",
    steps: [
      {
        label: "Find sender",
        selectors: ['[data-learn-target="sms-doctor-row"]'],
        instruction: "Tap the highlighted message from Doctor.",
        advanceOn: "click",
      },
      {
        label: "Extract date and time",
        selectors: ['[data-learn-target="sms-doctor-message"]'],
        instruction: "Read the highlighted message. Look for the words after 'on' and the time after the date.",
        question: "What is the date and time for the appointment?",
        answers: [
          {
            label: formatLearnAppointment(doctorAppointment),
            correct: true,
            accepted: [
              getDoctorAppointmentDetailsLabel(),
              `${getDoctorAppointmentDateLabel()} 15:00`,
              `${doctorDateParts.date} ${doctorDateParts.monthShort} ${doctorDateParts.year} 3:00 PM`,
            ],
          },
          { label: formatLearnAppointment(doctorAppointment, 60), correct: false },
          { label: formatLearnAppointment(doctorAppointment, 0, 1), correct: false },
        ],
      },
    ],
  },
  calendar: {
    title: "Calendar target",
    steps: [
      {
        label: "Choose date",
        selectors: ['[data-learn-target="calendar-single-date"]'],
        instruction: `Tap the highlighted date box for ${getDoctorAppointmentDateLabel()} to open the event editor.`,
        advanceOn: "click",
      },
      {
        label: "Add title",
        selectors: [".title-input"],
        instruction: "Type exactly: Psychiatry appointment. Date and time unlock after the title is filled.",
        advanceOn: "change",
        validate: (event) => event.target?.value.trim().toLowerCase() === "psychiatry appointment",
      },
      {
        label: "Check date",
        selectors: [".date-wheel-fields", ".date-wheel-part", ".date-wheel-value"],
        instruction: `Type ${String(doctorDateParts.date).padStart(2, "0")}, ${doctorDateParts.monthShort}, and ${doctorDateParts.year} into the three date boxes.`,
        advanceOn: "change",
        validate: (event) => {
          const parts = event.detail?.dateParts;
          return Boolean(parts && parts.date === doctorDateParts.date && parts.month === doctorDateParts.month && parts.year === doctorDateParts.year);
        },
      },
      {
        label: "Check time",
        selectors: [".time-edit"],
        instruction: "Set the start time to 15:00 and the end time to 16:00.",
        advanceOn: "change",
        validate: () => {
          const times = Array.from(document.querySelectorAll(".time-edit")).map((node) => node.value);
          return times.includes("15:00") && times.includes("16:00");
        },
      },
      {
        label: "Save entry",
        selectors: [".save-btn"],
        instruction: "Tap Save to place the entry onto the calendar.",
        output: "After saving, we will practise how to edit the entry.",
        completeEvent: "virtual-os-learn-calendar-saved",
        advanceOnComplete: true,
      },
      {
        label: "Open saved date",
        selectors: ['[data-learn-target="calendar-single-date"]'],
        instruction: "Tap the date with the saved entry to open it again.",
        advanceOn: "click",
      },
      {
        label: "Select entry",
        selectors: [".existing-pill"],
        instruction: "Tap the saved entry chip to edit it.",
        advanceOn: "click",
      },
      {
        label: "Edit details",
        selectors: [".title-input", ".save-btn"],
        instruction: "Edit only the title to Psychiatry follow-up. Keep the same date and time, then tap Save.",
        output: "Learning is complete when the edited entry is saved.",
        completeEvent: "virtual-os-learn-calendar-saved",
      },
    ],
  },
  whatsapp: {
    title: "WhatsApp target",
    steps: [
      {
        label: "Open dinner chat",
        selectors: ['[data-learn-target="wa-dinner-row"]'],
        instruction: "Tap the highlighted dinner chat.",
        advanceOn: "click",
      },
      {
        label: "Send reply",
        selectors: ['[data-learn-target="wa-dinner-bubble"]', ".wa-input-row input", ".wa-input-row button"],
        instruction: "Read the dinner message. Type exactly: Yes, I can attend dinner. Then tap Send.",
        output: "Learning is complete when your dinner reply is sent.",
        completeEvent: "virtual-os-learn-whatsapp-replied",
      },
    ],
  },
  maps: {
    title: "Maps target",
    steps: [
      {
        label: "Current location",
        selectors: [".maps-field:first-of-type select"],
        instruction: "Open Current location and choose Home.",
        advanceOn: "change",
        validate: (event) => Boolean(event.target?.value),
      },
      {
        label: "Destination",
        selectors: [".maps-field:nth-of-type(2) select"],
        instruction: "Open Destination and choose Clinic B. Home and Clinic B must be different.",
        advanceOn: "change",
        validate: (event) => {
          const destination = event.target?.value;
          const origin = document.querySelector(".maps-field:first-of-type select")?.value;
          return Boolean(origin && destination && origin !== destination);
        },
      },
      {
        label: "Travel mode",
        selectors: [".maps-route-options button", ".maps-time-field input"],
        instruction: "Choose Public transport, then check that the Leave at time field is visible.",
        advanceOn: "click",
        validate: (event) => Boolean(event.target?.closest?.(".maps-route-options button")),
      },
      {
        label: "Show route",
        selectors: [".maps-directions-btn"],
        instruction: "Tap Directions to show the path and travel duration.",
        output: "The route path and duration will appear on the map.",
        completeEvent: "virtual-os-learn-maps-route",
        advanceOnComplete: true,
      },
      {
        label: "Read duration",
        selectors: [".maps-route-summary"],
        instruction: "Read the route summary. The large number is the travel duration.",
        question: "What is the travel duration shown?",
        getAnswers: (data) => {
          const minutes = data.routeDuration || 14;
          return [
            { label: `${minutes} min`, correct: true },
            { label: `${minutes + 10} min`, correct: false },
            { label: `${Math.max(1, minutes - 5)} min`, correct: false },
          ];
        },
      },
    ],
  },
  bank: {
    title: "Bank target",
    steps: [
      {
        label: "Log in",
        selectors: [".bank-primary-btn"],
        instruction: "Tap Log in with Digital Token to enter the simulated bank app.",
        advanceOn: "click",
      },
      {
        label: "Check balance",
        selectors: [".bank-balance-card", ".bank-account-row"],
        instruction: "Read the Total balance card. Choose the amount shown.",
        question: "How much money is in the account?",
        answers: [
          { label: bankTotalBalance, correct: true, accepted: ["S$2,262.60", "$2262.60", "2262.60", "2,262.60"] },
          { label: "S$1842.50", correct: false },
          { label: "S$420.10", correct: false },
        ],
      },
      {
        label: "Start payment",
        selectors: [".bank-quick-actions button"],
        instruction: "Tap Transfer or PayNow to practise paying a clinic bill.",
        advanceOn: "click",
      },
      {
        label: "Choose recipient",
        selectors: [".bank-account-select select", ".bank-payee-card"],
        instruction: "Choose the recipient Hougang Polyclinic.",
        advanceOn: "click",
        validate: (event) => Boolean(event.target?.closest?.(".bank-payee-card")),
      },
      {
        label: "Enter amount",
        selectors: [".bank-amount-form input", ".bank-primary-btn"],
        instruction: "Enter amount 25.00 and purpose Clinic bill, then tap Review payment.",
        advanceOn: "click",
        validate: (event) => Boolean(event.target?.closest?.(".bank-primary-btn") && !event.target.disabled),
      },
      {
        label: "Review payment",
        selectors: [".bank-review", ".bank-token-card", ".bank-primary-btn"],
        instruction: "Review the payee and amount. Continue through the simulated approval screen.",
        output: "Learning is complete when the payment is submitted.",
        completeEvent: "virtual-os-learn-bank-payment",
      },
    ],
  },
};

export function getLearnSelectors(module) {
  return module.steps.flatMap((step) => step.selectors || []);
}

export function getLearnAppLabel(appId) {
  return LEARN_APP_CATALOG.find((app) => app.currentApp === appId)?.label || appId;
}

export function getStepAnswers(step, data) {
  if (!step) {
    return [];
  }
  return step.getAnswers ? step.getAnswers(data) : step.answers || [];
}
