import { formalThreads } from "../state/seedData.js";

function to12h(minutes) {
  const h24 = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, "0");
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return `${h12}:${mm} ${suffix}`;
}

function to24h(minutes) {
  const h24 = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, "0");
  return `${String(h24).padStart(2, "0")}:${mm}`;
}

function formatAppointmentDate(appointment, offsetDays = 0) {
  const date = new Date(appointment.year, appointment.month, appointment.date);
  date.setDate(date.getDate() + offsetDays);
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short" });
  return `${day} ${month} ${date.getFullYear()}`;
}

function formatSlashDate(appointment) {
  const day = String(appointment.date).padStart(2, "0");
  const month = String(appointment.month + 1).padStart(2, "0");
  return `${day}/${month}/${appointment.year}`;
}

function getDoctorAppointment() {
  return formalThreads
    .find((thread) => thread.id === "doctor")
    ?.messages.find((message) => message.appointment)
    ?.appointment;
}

function fallbackDoctorAppointment() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return {
    date: date.getDate(),
    month: date.getMonth(),
    year: date.getFullYear(),
    start: 15 * 60,
  };
}

export function getDoctorAppointmentTarget() {
  return getDoctorAppointment() || fallbackDoctorAppointment();
}

export function getDoctorAppointmentDateLabel(offsetDays = 0) {
  const appointment = getDoctorAppointmentTarget();
  return formatAppointmentDate(appointment, offsetDays);
}

export function getDoctorAppointmentDetailsLabel({ timeOffsetMinutes = 0, dateOffsetDays = 0 } = {}) {
  const appointment = getDoctorAppointmentTarget();
  return `${formatAppointmentDate(appointment, dateOffsetDays)}, ${to12h(appointment.start + timeOffsetMinutes)}, Clinic B`;
}

export function getDoctorAppointmentDateParts() {
  const appointment = getDoctorAppointmentTarget();
  return {
    date: appointment.date,
    month: appointment.month,
    year: appointment.year,
    monthShort: new Date(appointment.year, appointment.month, 1).toLocaleDateString("en-US", { month: "short" }),
  };
}

function buildAppointmentDetailsCheck() {
  const appointment = getDoctorAppointmentTarget();
  const correctDate = formatAppointmentDate(appointment);
  const wrongDate = formatAppointmentDate(appointment, 1);
  const correctTime = to12h(appointment.start);
  const wrongTime = to12h(appointment.start + 60);
  const clinic = "Clinic B";

  return {
    id: "appointment-details",
    practiceStepIds: ["read-details", "sms-read-details"],
    question: "Appointment date, time, and location",
    answers: [{
      label: getDoctorAppointmentDetailsLabel(),
      correct: true,
      accepted: [
        `${Number(correctDate.slice(0, 2))} ${correctDate.slice(3)} ${correctTime.replace(":00 ", "").toLowerCase()} ${clinic}`,
        `${formatSlashDate(appointment)} ${String(Math.floor(appointment.start / 60)).padStart(2, "0")}${String(appointment.start % 60).padStart(2, "0")} ${clinic}`,
        `${correctDate} ${to24h(appointment.start)} ${clinic}`,
      ],
    }, {
      label: getDoctorAppointmentDetailsLabel({ timeOffsetMinutes: 60 }),
      correct: false,
    }, {
      label: getDoctorAppointmentDetailsLabel({ dateOffsetDays: 1 }),
      correct: false,
    }],
  };
}

export const TASK_ANSWER_CHECKS = {
  appointmentDetails: buildAppointmentDetailsCheck(),
  routeDuration: {
    id: "route-duration",
    practiceStepIds: ["show-route", "maps-show-route"],
    question: "Travel duration shown",
    answers: [
      { label: "14 min", correct: true, accepted: ["14", "14 minutes"] },
      { label: "9 min", correct: false },
      { label: "24 min", correct: false },
    ],
  },
  clinicLocation: {
    id: "clinic-location",
    practiceStepIds: ["calendar-read-location", "payment-calendar-check-details"],
    question: "Clinic location shown",
    answers: [
      { label: "Clinic B", correct: true, accepted: ["B", "clinic b"] },
      { label: "Clinic A", correct: false },
      { label: "Clinic C", correct: false },
    ],
  },
  bankBalance: {
    id: "bank-balance",
    practiceStepIds: ["check-balance"],
    question: "Total balance shown",
    answers: [
      { label: "S$2262.60", correct: true, accepted: ["2262.60", "$2262.60", "S2262.60", "S$2,262.60", "2,262.60"] },
      { label: "S$1842.50", correct: false },
      { label: "S$420.10", correct: false },
    ],
  },
  paymentDetails: {
    id: "payment-details",
    practiceStepIds: ["review-details", "match-singpass-details"],
    question: "Payment recipient and amount",
    answers: [{
      label: "Hougang Polyclinic, S$25.00",
      correct: true,
      accepted: ["Hougang Polyclinic $25", "Hougang Polyclinic 25", "Hougang Polyclinic S25.00", "Polyclinic 25"],
    }, {
      label: "Hougang Polyclinic, S$250.00",
      correct: false,
    }, {
      label: "Sunrise Bank, S$25.00",
      correct: false,
    }],
  },
};

export function getTaskAnswerIds(key) {
  const check = TASK_ANSWER_CHECKS[key];
  return check ? [check.id, ...(check.practiceStepIds || [])] : [];
}

export function getAssessmentAnswerChecksForCriteria(criteria = []) {
  const checks = [];
  if (criteria.some((item) => (
    /read doctor|doctor sms|read appointment|appointment message/i.test(item)
    || /^identify\b/i.test(item)
    || /appointment date|date,\s*time/i.test(item)
    || /identify.*\d{1,2}\s+[a-z]{3}\s+\d{4}/i.test(item)
    || /\d{1,2}\s+[a-z]{3}\s+\d{4}.*clinic\s*b/i.test(item)
  ))) {
    checks.push(TASK_ANSWER_CHECKS.appointmentDetails);
  }
  if (criteria.some((item) => /read location|clinic location|check calendar appointment/i.test(item))) {
    checks.push(TASK_ANSWER_CHECKS.clinicLocation);
  }
  if (criteria.some((item) => /duration|travel/i.test(item))) {
    checks.push(TASK_ANSWER_CHECKS.routeDuration);
  }
  if (criteria.some((item) => /balance/i.test(item))) {
    checks.push(TASK_ANSWER_CHECKS.bankBalance);
  }
  if (criteria.some((item) => /review before approving|review and approve|pay hougang|payment recipient|amount/i.test(item))) {
    checks.push(TASK_ANSWER_CHECKS.paymentDetails);
  }
  return checks;
}
