import { getDateWheelFieldDisplays } from "../calendar/dateWheelInput";
import { TASK_ANSWER_CHECKS, getDoctorAppointmentDateLabel, getDoctorAppointmentDateParts, getDoctorAppointmentDetailsLabel } from "../taskAnswerChecks";
import { practicePage } from "./practiceGuideUtils";

const doctorDateParts = getDoctorAppointmentDateParts();
const doctorDateLabel = getDoctorAppointmentDateLabel();
const doctorDateInstruction = `${String(doctorDateParts.date).padStart(2, "0")}, ${doctorDateParts.monthShort}, ${doctorDateParts.year}`;

export const PRACTICE_GUIDES = {
  sms: {
    title: "Read appointment message",
    purpose: "Use Messages to find the key appointment information.",
    steps: [
      {
        id: "open-message",
        label: "Open the appointment message",
        prompts: [
          "Look for the message that contains appointment information.",
          "Check the sender names and unread rows.",
          "Tap the Doctor message row.",
        ],
        isDone: (event) => event.type === "click" && event.target?.closest?.('[data-learn-target="sms-doctor-row"]'),
      },
      {
        id: "read-details",
        label: "Read the date, time, and clinic location",
        question: `Enter the ${TASK_ANSWER_CHECKS.appointmentDetails.question.toLowerCase()}.`,
        answers: TASK_ANSWER_CHECKS.appointmentDetails.answers,
        prompts: [
          "Pause and scan the full message before leaving the screen.",
          "Look for the words after the date and time.",
          "The appointment details are inside the open message bubble.",
        ],
        isDone: (event) => event.type === "answer",
      },
    ],
  },
  calendar: {
    title: "Create or edit a calendar entry",
    purpose: "Use Calendar to record an appointment accurately.",
    steps: [
      {
        id: "choose-date",
        label: "Select the correct date",
        prompts: [
          "Start by finding the appointment date on the monthly view.",
          "Check the month and date before opening the editor.",
          "Tap the correct date box in Calendar.",
        ],
        isDone: (event) => event.type === "click" && event.target?.closest?.(".day-cell, .existing-pill"),
      },
      {
        id: "enter-title",
        label: "Enter a clear appointment title",
        prompts: [
          "Use the exact title provided by the scenario.",
          "For the clinic task, type Psychiatry appointment.",
          "Tap the title field and type: Psychiatry appointment.",
        ],
        isDone: (event) => event.type === "change" && event.target?.matches?.(".title-input") && event.target.value.trim().length > 0,
      },
      {
        id: "check-date-time",
        label: "Check the date and time fields",
        prompts: [
          "Use the exact date and time from the scenario.",
          `For the clinic task, set ${doctorDateLabel}, 3:00 PM to 4:00 PM.`,
          `Edit the date boxes or time field if it does not match ${doctorDateLabel} and 15:00-16:00.`,
        ],
        isDone: (event) => event.type === "change"
          && (event.target?.closest?.(".date-wheel-fields") || event.target?.matches?.(".time-edit"))
          && isClinicDateTimeSet(event),
      },
      {
        id: "save-entry",
        label: "Save the calendar entry",
        prompts: [
          "Once the details are correct, finish the entry.",
          "Look for the save control near the editor.",
          "Tap Save.",
        ],
        isDone: (event) => event.type === "complete" && event.name === "virtual-os-learn-calendar-saved",
      },
    ],
  },
  whatsapp: {
    title: "Reply to a WhatsApp message",
    purpose: "Use the normal chat interface to read, type, and send a reply.",
    steps: [
      {
        id: "open-chat",
        label: "Open the relevant chat",
        prompts: [
          "Look for the chat that contains the request.",
          "Check the sender or group name.",
          "Tap the Family Group or requested contact.",
        ],
        isDone: (event) => event.type === "click" && Boolean(event.target?.closest?.('[data-learn-target="wa-dinner-row"], .wa-row[data-thread-id="family"]')),
      },
      {
        id: "type-reply",
        label: "Type a reply in the message box",
        prompts: [
          "Use the exact reply provided by the scenario.",
          "The reply is: Yes, I can attend dinner.",
          "Tap the message box and type: Yes, I can attend dinner.",
        ],
        isDone: (event) => event.type === "change" && event.target?.closest?.(".wa-input-row") && event.target.value.trim().length > 0,
      },
      {
        id: "send-reply",
        label: "Send the reply",
        prompts: [
          "After typing, send the message.",
          "Look for the send button beside the text box.",
          "Tap Send.",
        ],
        isDone: (event) => event.type === "complete" && event.name === "virtual-os-learn-whatsapp-replied",
      },
    ],
  },
  maps: {
    title: "Plan a route",
    purpose: "Use Maps to set a start point, destination, and read travel time.",
    steps: [
      {
        id: "choose-start",
        label: "Choose current location",
        prompts: [
          "Use the exact start point from the scenario.",
          "The start point is Home.",
          "Choose Home from the Current location dropdown.",
        ],
        isDone: (event) => event.type === "change" && event.target?.closest?.(".maps-field:first-of-type") && Boolean(event.target.value),
      },
      {
        id: "choose-destination",
        label: "Choose a different destination",
        prompts: [
          "Use the exact destination from the scenario.",
          "The destination is Clinic B.",
          "Choose Clinic B from the Destination dropdown.",
        ],
        isDone: (event) => {
          if (!(event.type === "change" && event.target?.closest?.(".maps-field:nth-of-type(2)"))) return false;
          const origin = document.querySelector(".maps-field:first-of-type select")?.value;
          return Boolean(origin && event.target.value && origin !== event.target.value);
        },
      },
      {
        id: "select-mode",
        label: "Select travel mode",
        prompts: [
          "Use the travel mode from the scenario.",
          "Choose Public transport.",
          "Tap Public transport before showing the route.",
        ],
        isDone: (event) => event.type === "click" && event.target?.closest?.(".maps-route-options button"),
      },
      {
        id: "show-route",
        label: "Show route and read duration",
        question: `Enter the ${TASK_ANSWER_CHECKS.routeDuration.question.toLowerCase()}.`,
        answers: TASK_ANSWER_CHECKS.routeDuration.answers,
        prompts: [
          "Now ask Maps to calculate the route.",
          "Look for the Directions button.",
          "Tap Directions, then read the duration shown.",
        ],
        isDone: (event) => event.type === "answer",
      },
    ],
  },
  bank: {
    title: "Check balance and make payment",
    purpose: "Use the simulated bank app to check details before confirming a payment.",
    steps: [
      {
        id: "login",
        label: "Log in to the bank app",
        prompts: [
          "Start from the official bank app login screen.",
          "Look for the main login button.",
          "Tap Log in with Digital Token.",
        ],
        isDone: (event) => event.type === "click" && event.target?.closest?.(".bank-primary-btn"),
      },
      {
        id: "check-balance",
        label: "Check the account balance",
        question: `Enter the ${TASK_ANSWER_CHECKS.bankBalance.question.toLowerCase()}.`,
        answers: TASK_ANSWER_CHECKS.bankBalance.answers,
        prompts: [
          "Find the balance before starting the payment.",
          "The expected total balance is S$2262.60.",
          "Check that the balance card shows S$2262.60.",
        ],
        isDone: (event) => event.type === "answer",
      },
      {
        id: "start-payment",
        label: "Start the payment flow",
        prompts: [
          "After checking balance, start the clinic payment.",
          "The payment is to Hougang Polyclinic.",
          "Tap Transfer or PayNow.",
        ],
        isDone: (event) => event.type === "click" && event.target?.closest?.(".bank-quick-actions button"),
      },
      {
        id: "review-details",
        label: "Review recipient and amount",
        question: `Enter the ${TASK_ANSWER_CHECKS.paymentDetails.question.toLowerCase()}.`,
        answers: TASK_ANSWER_CHECKS.paymentDetails.answers,
        prompts: [
          "Before approving, check who is being paid and how much.",
          "The recipient should be Hougang Polyclinic and the amount should be S$25.00.",
          "Enter: Hougang Polyclinic, S$25.00.",
        ],
        isDone: (event) => event.type === "answer",
      },
      {
        id: "complete-payment",
        label: "Complete the simulated payment",
        prompts: [
          "Finish only after checking the details.",
          "Use the approval button when the payment is expected.",
          "Approve the simulated payment.",
        ],
        isDone: (event) => event.type === "complete" && event.name === "virtual-os-learn-bank-payment",
      },
    ],
  },
};

export const COMPLETE_EVENTS = [
  "virtual-os-learn-calendar-saved",
  "virtual-os-learn-whatsapp-replied",
  "virtual-os-learn-maps-route",
  "virtual-os-learn-bank-payment",
];

export const APP_LABELS = {
  home: "Home",
  sms: "Messages",
  calendar: "Calendar",
  whatsapp: "WhatsApp",
  maps: "Maps",
  bank: "Bank",
};

export function isPracticeDateTimeSet(event, { date = doctorDateParts.date, month = doctorDateParts.month, year = doctorDateParts.year, start, end }) {
  const dateParts = event.detail?.dateParts;
  const dateReady = dateParts
    ? dateParts.date === date && dateParts.month === month && dateParts.year === year
    : Array.from(document.querySelectorAll(".date-wheel-fields"))
      .some((field) => {
        const values = getDateWheelFieldDisplays(field);
        const expectedMonth = new Date(year, month, 1).toLocaleDateString("en-US", { month: "short" });
        return values[0] === String(date).padStart(2, "0") && values[1] === expectedMonth && values[2] === String(year);
      });
  const times = Array.from(document.querySelectorAll(".time-edit")).map((node) => node.value);
  return dateReady && times.includes(start) && times.includes(end);
}

function isClinicDateTimeSet(event) {
  return isPracticeDateTimeSet(event, { start: "15:00", end: "16:00" });
}

function isDinnerDateTimeSet(event) {
  return isPracticeDateTimeSet(event, { start: "18:30", end: "20:00" });
}

function appOpenStep(app, label = `Open ${APP_LABELS[app] || app}`, id = `open-${app}`) {
  return {
    id,
    label,
    prompts: [
      `Go to ${APP_LABELS[app] || app}.`,
      "Use the Home or navigation buttons to switch apps.",
      `Open ${APP_LABELS[app] || app} now.`,
    ],
    isDone: (event) => event.type === "app" && event.app === app,
  };
}

function goHomeStep(id, label = "Go to Home screen") {
  return {
    id,
    label,
    prompts: [
      "Leave this page before opening the next app.",
      "Use the Android Home button in the bottom navigation bar.",
      "Tap Home to return to the app grid.",
    ],
    isDone: (event) => event.type === "app" && event.app === "home",
  };
}

const COMMON_STEPS = {
  readDoctorSms: [
    {
      id: "sms-open-doctor",
      label: "Open the Doctor SMS",
      prompts: [
        "Look for the message that contains appointment information.",
        "Check the sender names and unread rows.",
        "Tap the Doctor message row.",
      ],
      isDone: (event) => event.type === "click" && event.target?.closest?.('[data-learn-target="sms-doctor-row"]'),
    },
    {
      id: "sms-read-details",
      label: "Read date, time, and clinic location",
      question: `Enter the ${TASK_ANSWER_CHECKS.appointmentDetails.question.toLowerCase()}.`,
      answers: TASK_ANSWER_CHECKS.appointmentDetails.answers,
      prompts: [
        "Pause and scan the full message before leaving the screen.",
        `Look for ${getDoctorAppointmentDetailsLabel()}.`,
        "Read the appointment details inside the open message bubble.",
      ],
      isDone: (event) => event.type === "answer",
    },
  ],
  calendarClinic: [
    {
      id: "calendar-choose-date",
      label: `Select ${doctorDateLabel}`,
      prompts: [
        "Find the exact appointment date on the monthly view.",
        `The correct date is ${doctorDateLabel}.`,
        "Tap the highlighted date box.",
      ],
      isDone: (event) => event.type === "click" && Boolean(event.target?.closest?.('[data-learn-target="calendar-single-date"][data-calendar-date="target"]')),
    },
    {
      id: "calendar-enter-title",
      label: "Enter title: Psychiatry appointment",
      prompts: [
        "Use the exact title provided by the scenario.",
        "For the clinic task, type Psychiatry appointment.",
        "Tap the title field and type: Psychiatry appointment.",
      ],
      isDone: (event) => event.type === "change"
        && event.target?.matches?.(".title-input")
        && event.target.value.trim().toLowerCase() === "psychiatry appointment",
    },
    {
      id: "calendar-check-date-time",
      label: `Set ${doctorDateLabel}, 15:00 to 16:00`,
      prompts: [
        "Use the exact date and time from the scenario.",
        `Choose ${doctorDateInstruction}, then set 15:00 to 16:00.`,
        `Edit the date boxes or time field if it does not match ${doctorDateLabel} and 15:00-16:00.`,
      ],
      isDone: (event) => event.type === "change"
        && (event.target?.closest?.(".date-wheel-fields") || event.target?.matches?.(".time-edit"))
        && isClinicDateTimeSet(event),
    },
    {
      id: "calendar-save",
      label: "Save the calendar event",
      prompts: [
        "Once the details are correct, finish the entry.",
        "Look for the save control near the editor.",
        "Tap Save.",
      ],
      isDone: (event) => event.type === "complete" && event.name === "virtual-os-learn-calendar-saved",
    },
  ],
  mapsClinic: [
    {
      id: "maps-start-home",
      label: "Set start: Home",
      prompts: [
        "Use the exact start point from the scenario.",
        "The start point is Home.",
        "Choose Home from the Current location dropdown.",
      ],
      isDone: (event) => event.type === "change" && event.target?.closest?.(".maps-field:first-of-type") && Boolean(event.target.value),
    },
    {
      id: "maps-destination-clinic",
      label: "Set destination: Clinic B",
      prompts: [
        "Use the exact destination from the scenario.",
        "The destination is Clinic B.",
        "Choose Clinic B from the Destination dropdown.",
      ],
      isDone: (event) => {
        if (!(event.type === "change" && event.target?.closest?.(".maps-field:nth-of-type(2)"))) return false;
        const origin = document.querySelector(".maps-field:first-of-type select")?.value;
        return Boolean(origin && event.target.value && origin !== event.target.value);
      },
    },
    {
      id: "maps-travel-mode",
      label: "Choose Public transport",
      prompts: [
        "Use the travel mode from the scenario.",
        "Choose Public transport.",
        "Tap Public transport before showing the route.",
      ],
      isDone: (event) => event.type === "click" && event.target?.closest?.(".maps-route-options button"),
    },
    {
      id: "maps-show-route",
      label: "Tap Directions and read duration",
      question: `Enter the ${TASK_ANSWER_CHECKS.routeDuration.question.toLowerCase()}.`,
      answers: TASK_ANSWER_CHECKS.routeDuration.answers,
      prompts: [
        "Now ask Maps to calculate the route.",
        "Look for the Directions button.",
        "Tap Directions, then read the duration shown.",
      ],
      isDone: (event) => event.type === "answer",
    },
  ],
};

export const PRACTICE_PAGE_OVERRIDES = {
  "single-messages-details": [
    practicePage("home-to-sms", "home", "Home screen", [
      appOpenStep("sms", "Open Messages", "single-sms-open-messages"),
    ]),
    practicePage("sms-source", "sms", "Messages page", PRACTICE_GUIDES.sms.steps),
  ],
  "single-calendar-entry": [
    practicePage("home-to-calendar", "home", "Home screen", [
      appOpenStep("calendar", "Open Calendar", "single-calendar-open-calendar"),
    ]),
    practicePage("calendar-entry", "calendar", "Calendar page", COMMON_STEPS.calendarClinic),
  ],
  "single-whatsapp-reply": [
    practicePage("home-to-whatsapp", "home", "Home screen", [
      appOpenStep("whatsapp", "Open WhatsApp", "single-wa-open-whatsapp"),
    ]),
    practicePage("whatsapp-reply", "whatsapp", "WhatsApp page", PRACTICE_GUIDES.whatsapp.steps),
  ],
  "single-maps-route": [
    practicePage("home-to-maps", "home", "Home screen", [
      appOpenStep("maps", "Open Maps", "single-maps-open-maps"),
    ]),
    practicePage("maps-route", "maps", "Maps page", COMMON_STEPS.mapsClinic),
  ],
  "single-bank-payment": [
    practicePage("home-to-bank", "home", "Home screen", [
      appOpenStep("bank", "Open Bank", "single-bank-open-bank"),
    ]),
    practicePage("bank-payment", "bank", "Bank page", PRACTICE_GUIDES.bank.steps),
  ],
  "two-sms-calendar": [
    practicePage("sms-source", "sms", "Messages page", [
      appOpenStep("sms", "Open Messages", "two-sms-open-messages"),
      ...COMMON_STEPS.readDoctorSms,
      goHomeStep("two-sms-go-home"),
    ]),
    practicePage("home-to-calendar", "home", "Home screen", [
      appOpenStep("calendar", "Open Calendar", "two-sms-open-calendar"),
    ]),
    practicePage("calendar-entry", "calendar", "Calendar page", COMMON_STEPS.calendarClinic),
  ],
  "two-whatsapp-calendar": [
    practicePage("whatsapp-reply", "whatsapp", "WhatsApp page", [
      appOpenStep("whatsapp", "Open WhatsApp", "two-wa-open-whatsapp"),
      ...PRACTICE_GUIDES.whatsapp.steps,
      goHomeStep("two-wa-go-home"),
    ]),
    practicePage("home-to-calendar", "home", "Home screen", [
      appOpenStep("calendar", "Open Calendar", "two-wa-open-calendar"),
    ]),
    practicePage("calendar-dinner", "calendar", "Calendar page", [
      {
        ...COMMON_STEPS.calendarClinic[0],
        id: "dinner-calendar-choose-date",
        label: `Select ${doctorDateLabel} for Dinner`,
      },
      {
        ...COMMON_STEPS.calendarClinic[1],
        id: "dinner-calendar-title",
        label: "Enter title: Dinner",
        prompts: [
          "Use the exact title provided by the scenario.",
          "For the social task, type Dinner.",
          "Tap the title field and type: Dinner.",
        ],
        isDone: (event) => event.type === "change"
          && event.target?.matches?.(".title-input")
          && event.target.value.trim().toLowerCase() === "dinner",
      },
      {
        ...COMMON_STEPS.calendarClinic[2],
        id: "dinner-calendar-time",
        label: "Set dinner time: 18:30 to 20:00",
        prompts: [
          "Use the exact dinner date and time from the scenario.",
          `Choose ${doctorDateInstruction}, then set 18:30 to 20:00.`,
          `Edit the date boxes or time field if it does not match ${doctorDateLabel} and 18:30-20:00.`,
        ],
        isDone: (event) => event.type === "change"
          && (event.target?.closest?.(".date-wheel-fields") || event.target?.matches?.(".time-edit"))
          && isDinnerDateTimeSet(event),
      },
      { ...COMMON_STEPS.calendarClinic[3], id: "dinner-calendar-save" },
    ]),
  ],
  "two-calendar-maps": [
    practicePage("calendar-check", "calendar", "Calendar page", [
      appOpenStep("calendar", "Open Calendar", "two-cal-open-calendar"),
      {
        id: "calendar-open-appointment",
        label: "Open the clinic appointment",
        prompts: [
          "Find the saved clinic appointment.",
          "Tap the event on the correct date.",
          "Open the appointment so you can read the location.",
        ],
        isDone: (event) => event.type === "click" && event.target?.closest?.(".existing-pill, .chip"),
      },
      {
        id: "calendar-read-location",
        label: "Read location: Clinic B",
        question: `Enter the ${TASK_ANSWER_CHECKS.clinicLocation.question.toLowerCase()}.`,
        answers: TASK_ANSWER_CHECKS.clinicLocation.answers,
        prompts: [
          "Read the appointment details before leaving Calendar.",
          "Look for the clinic location.",
          "Enter: Clinic B.",
        ],
        isDone: (event) => event.type === "answer",
      },
      goHomeStep("two-cal-go-home"),
    ]),
    practicePage("home-to-maps", "home", "Home screen", [
      appOpenStep("maps", "Open Maps", "two-cal-open-maps"),
    ]),
    practicePage("maps-route", "maps", "Maps page", COMMON_STEPS.mapsClinic),
  ],
  "multi-clinic-day": [
    practicePage("sms-source", "sms", "Messages page", [
      appOpenStep("sms", "Open Messages", "multi-clinic-open-messages"),
      ...COMMON_STEPS.readDoctorSms,
      goHomeStep("multi-clinic-home-after-sms"),
    ]),
    practicePage("home-to-calendar", "home", "Home screen", [
      appOpenStep("calendar", "Open Calendar", "multi-clinic-open-calendar"),
    ]),
    practicePage("calendar-entry", "calendar", "Calendar page", [
      ...COMMON_STEPS.calendarClinic,
      goHomeStep("multi-clinic-home-after-calendar"),
    ]),
    practicePage("home-to-maps", "home", "Home screen", [
      appOpenStep("maps", "Open Maps", "multi-clinic-open-maps"),
    ]),
    practicePage("maps-route", "maps", "Maps page", COMMON_STEPS.mapsClinic),
  ],
  "multi-social-clinic": [
    practicePage("sms-source", "sms", "Messages page", [
      appOpenStep("sms", "Open Messages", "multi-social-open-messages"),
      ...COMMON_STEPS.readDoctorSms,
      goHomeStep("multi-social-home-after-sms"),
    ]),
    practicePage("home-to-calendar", "home", "Home screen", [
      appOpenStep("calendar", "Open Calendar", "multi-social-open-calendar"),
    ]),
    practicePage("calendar-entry", "calendar", "Calendar page", [
      ...COMMON_STEPS.calendarClinic,
      goHomeStep("multi-social-home-after-calendar"),
    ]),
    practicePage("home-to-whatsapp", "home", "Home screen", [
      appOpenStep("whatsapp", "Open WhatsApp", "multi-social-open-whatsapp"),
    ]),
    practicePage("whatsapp-reply", "whatsapp", "WhatsApp page", PRACTICE_GUIDES.whatsapp.steps),
  ],
  "multi-payment-appointment": [
    practicePage("sms-source", "sms", "Messages page", [
      appOpenStep("sms", "Open Messages", "multi-payment-open-messages"),
      ...COMMON_STEPS.readDoctorSms,
      goHomeStep("multi-payment-home-after-sms"),
    ]),
    practicePage("home-to-calendar", "home", "Home screen", [
      appOpenStep("calendar", "Open Calendar", "multi-payment-open-calendar"),
    ]),
    practicePage("calendar-check", "calendar", "Calendar page", [
      {
        id: "payment-calendar-open-appointment",
        label: "Check the saved clinic appointment",
        prompts: [
          "Find the clinic appointment.",
          "Check that it matches the message details.",
          "Open the appointment and confirm the details before leaving Calendar.",
        ],
        isDone: (event) => event.type === "click" && event.target?.closest?.(".existing-pill, .chip, .day-cell"),
      },
      {
        id: "payment-calendar-check-details",
        label: "Confirm clinic location",
        question: `Enter the ${TASK_ANSWER_CHECKS.clinicLocation.question.toLowerCase()}.`,
        answers: TASK_ANSWER_CHECKS.clinicLocation.answers,
        prompts: [
          "Check the appointment detail.",
          "The location should match the Doctor message.",
          "Enter: Clinic B.",
        ],
        isDone: (event) => event.type === "answer",
      },
      goHomeStep("multi-payment-home-after-calendar"),
    ]),
    practicePage("home-to-bank", "home", "Home screen", [
      appOpenStep("bank", "Open Bank", "multi-payment-open-bank"),
    ]),
    practicePage("bank-payment", "bank", "Bank page", PRACTICE_GUIDES.bank.steps),
  ],
};
