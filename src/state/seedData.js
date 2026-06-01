const now = new Date();

function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function to12h(minutes) {
  const h24 = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, "0");
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${mm} ${suffix}`;
}

function formatDateLong(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const mon = date.toLocaleString("en-US", { month: "short" });
  return `${day} ${mon} ${date.getFullYear()}`;
}

function jsDayToMonIndex(jsDay) {
  return (jsDay + 6) % 7;
}

const doctorDateObj = addDays(now, 7);
const doctorStart = 15 * 60;
const doctorEnd = 15 * 60 + 45;

const polyDateObj = addDays(now, 11);
const polyStart = 10 * 60;
const polyEnd = 10 * 60 + 30;

export const formalThreads = [
  {
    id: "doctor",
    sender: "Doctor",
    preview: `Dear CLIENT, you have an PSYCHIATRY outpatient clinic appt on ${formatDateLong(doctorDateObj)} ${to12h(doctorStart)} at Clinic B.`,
    timeLabel: "Now",
    unread: 1,
    avatarColor: "#ff8b2c",
    messages: [
      {
        id: "d1",
        text: `Dear CLIENT, you have an PSYCHIATRY outpatient clinic appt on ${formatDateLong(doctorDateObj)} ${to12h(doctorStart)} at Clinic B.`,
        time: "Today",
        appointment: {
          id: "sms-doctor-main",
          title: "Psychiatry Clinic",
          date: doctorDateObj.getDate(),
          month: doctorDateObj.getMonth(),
          year: doctorDateObj.getFullYear(),
          day: jsDayToMonIndex(doctorDateObj.getDay()),
          start: doctorStart,
          end: doctorEnd,
          source: "SMS",
          rigid: true,
        },
      },
    ],
  },
  {
    id: "polyclinic",
    sender: "Polyclinic",
    preview: `Dear CLIENT, your polyclinic appointment is on ${formatDateLong(polyDateObj)} ${to12h(polyStart)}.`,
    timeLabel: "Now",
    unread: 1,
    avatarColor: "#66c57a",
    messages: [
      {
        id: "p1",
        text: `Dear CLIENT, your polyclinic appointment is on ${formatDateLong(polyDateObj)} ${to12h(polyStart)}.`,
        time: "Today",
        appointment: {
          id: "sms-polyclinic-main",
          title: "Polyclinic Appointment",
          date: polyDateObj.getDate(),
          month: polyDateObj.getMonth(),
          year: polyDateObj.getFullYear(),
          day: jsDayToMonIndex(polyDateObj.getDay()),
          start: polyStart,
          end: polyEnd,
          source: "SMS",
          rigid: true,
        },
      },
    ],
  },
  {
    id: "bank",
    sender: "DBS Bank",
    preview: "Fr DBS: ALERT: DO NOT share this OTP with anyone.",
    timeLabel: "19 Mar",
    unread: 28,
    avatarColor: "#ff64ba",
    messages: [{ id: "b1", text: "This is a security reminder.", time: "19 Mar" }],
  },
];

export const whatsappThreads = [
  {
    id: "jia-wei",
    sender: "Jia Wei",
    timeLabel: "2:31 pm",
    unreadMessages: 2,
    messages: [
      { id: "jw1", mine: false, text: `Can meet on ${formatDateLong(doctorDateObj)} at ${to12h(doctorStart)}?` },
      { id: "jw2", mine: false, text: "Need to confirm now." },
    ],
  },
  {
    id: "nadiah",
    sender: "Nadiah",
    timeLabel: "1:02 pm",
    unreadMessages: 2,
    messages: [
      { id: "nd1", mine: false, text: "I am free on weekday afternoons." },
      { id: "nd2", mine: false, text: "Any slot after 3 PM works." },
    ],
  },
  {
    id: "family",
    sender: "Family Group",
    timeLabel: "Yesterday",
    unreadMessages: 1,
    messages: [{ id: "fm1", mine: false, text: "Dinner on Saturday?" }],
  },
];

export const weeklyRules = [
  "Leave at least 30 minutes travel time between appointments.",
  "No more than 4 appointments in one day.",
  "Avoid overlap with rigid clinical appointments.",
];

export const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const monthModelDate = new Date();
const monthModelDays = Array.from(
  { length: new Date(monthModelDate.getFullYear(), monthModelDate.getMonth() + 1, 0).getDate() },
  (_, index) => ({ date: index + 1, inMonth: true })
);

export const monthModel = {
  monthLabel: monthModelDate.toLocaleDateString("en-US", { month: "long" }),
  month: monthModelDate.getMonth(),
  year: monthModelDate.getFullYear(),
  weekHeaders: ["S", "M", "T", "W", "T", "F", "S"],
  days: monthModelDays,
};

export const initialEvents = [];

export const calendarMeta = {
  todayDate: now.getDate(),
  todayMonth: now.getMonth(),
  todayYear: now.getFullYear(),
  todayLabel: now.toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }),
};
