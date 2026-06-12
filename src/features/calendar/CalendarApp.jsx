import { useEffect, useMemo, useState } from "react";
import { formalThreads, monthModel } from "../../state/seedData";
import { useVirtualOS } from "../../state/VirtualOSContext";
import { MONTH_LABELS, parseDateWheelPartInput } from "./dateWheelInput";
import { dateInputValue, datePartsFromValue, parseDateInput, updateDatePartValue } from "./dateUtils";

function formatDateLabel(year, month, date) {
  const d = new Date(year, month, date);
  const day = d.toLocaleDateString("en-US", { weekday: "short" });
  const mon = d.toLocaleDateString("en-US", { month: "short" });
  return `${day}, ${String(date).padStart(2, "0")} ${mon} ${year}`;
}

function toMinutes(value) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function toTimeString(minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function mondayIndex(jsDay) {
  return (jsDay + 6) % 7;
}

function keyFor(y, m, d) {
  return `${y}-${m}-${d}`;
}

const doctorAppointment = formalThreads.find((thread) => thread.id === "doctor")?.messages.find((message) => message.appointment)?.appointment;

function buildMonthDays(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const days = [];

  for (let i = 0; i < totalCells; i += 1) {
    const offset = i - firstDay;
    if (offset < 0) {
      days.push({ date: prevMonthDays + offset + 1, inMonth: false, month: month - 1, year });
    } else if (offset >= daysInMonth) {
      days.push({ date: offset - daysInMonth + 1, inMonth: false, month: month + 1, year });
    } else {
      days.push({ date: offset + 1, inMonth: true, month, year });
    }
  }

  return days.map((d) => {
    let y = d.year;
    let m = d.month;
    if (m < 0) {
      y -= 1;
      m = 11;
    }
    if (m > 11) {
      y += 1;
      m = 0;
    }
    return { ...d, year: y, month: m };
  });
}

function DateWheelFields({ disabled, fieldId, selected, currentYear, onChoosePart }) {
  const [draftParts, setDraftParts] = useState({});
  const daysInMonth = new Date(selected.year, selected.month + 1, 0).getDate();
  const parts = [
    { id: "date", label: "Day", display: String(selected.date).padStart(2, "0"), inputMode: "numeric", maxLength: 2 },
    { id: "month", label: "Month", display: MONTH_LABELS[selected.month]?.short || "Month", inputMode: "text", maxLength: 9 },
    { id: "year", label: "Year", display: String(selected.year), inputMode: "numeric", maxLength: 4 },
  ];

  function getPartKey(partId) {
    return `${fieldId}-${partId}`;
  }

  function clearDraft(partId) {
    const key = getPartKey(partId);
    setDraftParts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function parsePart(part, raw) {
    return parseDateWheelPartInput(part.id, raw, {
      daysInMonth,
      minYear: currentYear - 1,
      maxYear: currentYear + 6,
    });
  }

  function updatePartIfValid(part, raw, target) {
    const value = parsePart(part, raw);
    if (value === null) {
      return false;
    }
    const next = onChoosePart(part.id, value);
    window.dispatchEvent(new CustomEvent("virtual-os-learn-step-action", {
      detail: { eventType: "change", target, dateParts: next },
    }));
    window.dispatchEvent(new CustomEvent("virtual-os-guide-step-action", {
      detail: { eventType: "change", target, dateParts: next },
    }));
    return true;
  }

  return (
    <div
      className="date-wheel-fields"
      data-learn-target="calendar-date-wheel"
      role="group"
      aria-label="Edit date"
    >
      {parts.map((part) => {
        const key = getPartKey(part.id);
        return (
          <label key={part.id} className="date-wheel-part" aria-label={part.label}>
            <input
              className="date-wheel-value date-wheel-input"
              type="text"
              inputMode={part.inputMode}
              readOnly={disabled}
              value={draftParts[key] ?? part.display}
              maxLength={part.maxLength}
              aria-label={part.label}
              onClick={(event) => {
                event.currentTarget.focus();
                event.currentTarget.select();
              }}
              onFocus={(event) => {
                setDraftParts((current) => ({ ...current, [key]: part.display }));
                event.currentTarget.select();
              }}
              onChange={(event) => {
                if (disabled) {
                  return;
                }
                const value = event.target.value;
                setDraftParts((current) => ({ ...current, [key]: value }));
                updatePartIfValid(part, value, event.currentTarget);
              }}
              onBlur={(event) => {
                updatePartIfValid(part, event.target.value, event.currentTarget);
                clearDraft(part.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  updatePartIfValid(part, event.currentTarget.value, event.currentTarget);
                  clearDraft(part.id);
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  clearDraft(part.id);
                  event.currentTarget.blur();
                }
              }}
            />
          </label>
        );
      })}
    </div>
  );
}

export function CalendarApp() {
  const { state, addEvent, updateEvent, deleteEvent, helpers } = useVirtualOS();
  const currentDate = new Date();
  const [displayYear, setDisplayYear] = useState(currentDate.getFullYear());
  const [displayMonth, setDisplayMonth] = useState(currentDate.getMonth());
  const [editorDate, setEditorDate] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    title: "",
    allDay: false,
    date: "",
    start: "15:30",
    end: "16:30",
  });
  const effectiveMode = state.session.currentUserId
    ? state.session.userModes[state.session.currentUserId] || state.session.mode
    : state.session.mode;
  const isLearnMode = effectiveMode === "learn";
  const currentUserId = state.session.currentUserId;
  const assignedLearnApp = currentUserId ? state.session.learnModules?.[currentUserId] : null;
  const learnDoctorDraft = isLearnMode && assignedLearnApp === "calendar" && doctorAppointment
    ? {
        id: "learn-doctor-draft",
        title: "Doctor appointment",
        date: doctorAppointment.date,
        month: doctorAppointment.month,
        year: doctorAppointment.year,
        day: doctorAppointment.day,
        start: doctorAppointment.start,
        end: doctorAppointment.end,
        source: "Calendar",
        rigid: false,
        learnDraft: true,
      }
    : null;

  useEffect(() => {
    setDisplayYear(currentDate.getFullYear());
    setDisplayMonth(currentDate.getMonth());
    setEditorDate(null);
    setEditingId(null);
    setForm({
      title: "",
      allDay: false,
      date: "",
      start: "15:30",
      end: "16:30",
    });
  }, [currentUserId, effectiveMode]);

  const visibleEvents = useMemo(() => (
    [
      ...state.events.filter((event) => !event.accountId || event.accountId === currentUserId),
      ...(learnDoctorDraft ? [learnDoctorDraft] : []),
    ]
  ), [state.events, currentUserId, learnDoctorDraft]);

  const monthDays = useMemo(() => buildMonthDays(displayYear, displayMonth), [displayYear, displayMonth]);

  const eventsByKey = useMemo(() => {
    return visibleEvents.reduce((acc, event) => {
      const y = event.year ?? monthModel.year;
      const m = event.month ?? monthModel.month;
      const k = keyFor(y, m, event.date);
      if (!acc[k]) {
        acc[k] = [];
      }
      acc[k].push(event);
      return acc;
    }, {});
  }, [visibleEvents]);

  function openEditor(dayObj) {
    setEditorDate({ year: dayObj.year, month: dayObj.month, date: dayObj.date });
    setEditingId(null);
    const draftOnDay = learnDoctorDraft
      && learnDoctorDraft.date === dayObj.date
      && learnDoctorDraft.month === dayObj.month
      && learnDoctorDraft.year === dayObj.year;
    setForm({
      title: draftOnDay ? learnDoctorDraft.title : "",
      allDay: false,
      date: dateInputValue(dayObj),
      start: draftOnDay ? toTimeString(learnDoctorDraft.start) : "15:30",
      end: draftOnDay ? toTimeString(learnDoctorDraft.end) : "16:30",
    });
  }

  function loadEvent(event) {
    const eventDate = {
      year: event.year ?? monthModel.year,
      month: event.month ?? monthModel.month,
      date: event.date,
    };
    setEditorDate(eventDate);
    setEditingId(event.learnDraft ? null : event.id);
    setForm({
      title: event.title,
      allDay: false,
      date: dateInputValue(eventDate),
      start: toTimeString(event.start),
      end: toTimeString(event.end),
    });
  }

  function moveMonth(delta) {
    let y = displayYear;
    let m = displayMonth + delta;
    if (m < 0) {
      y -= 1;
      m = 11;
    }
    if (m > 11) {
      y += 1;
      m = 0;
    }
    setDisplayYear(y);
    setDisplayMonth(m);
  }

  function saveEvent() {
    if (!editorDate) {
      return;
    }
    const start = toMinutes(form.start);
    const end = toMinutes(form.end);
    const parsedDate = parseDateInput(form.date);
    if (end <= start || !parsedDate || !form.title.trim()) {
      return;
    }
    const dt = new Date(parsedDate.year, parsedDate.month, parsedDate.date);

    if (editingId) {
      updateEvent(editingId, {
        title: form.title.trim(),
        date: parsedDate.date,
        month: parsedDate.month,
        year: parsedDate.year,
        day: mondayIndex(dt.getDay()),
        start,
        end,
      });
      window.dispatchEvent(new CustomEvent("virtual-os-learn-calendar-saved", { detail: { type: "updated" } }));
    } else {
      addEvent({
        id: `cal-${Date.now()}`,
        title: form.title.trim(),
        date: parsedDate.date,
        month: parsedDate.month,
        year: parsedDate.year,
        day: mondayIndex(dt.getDay()),
        start,
        end,
        source: "Calendar",
        rigid: false,
      });
      window.dispatchEvent(new CustomEvent("virtual-os-learn-calendar-saved", { detail: { type: "created" } }));
    }

    setEditorDate(null);
    setEditingId(null);
  }

  function removeEvent() {
    if (!editingId) {
      return;
    }
    deleteEvent(editingId);
    setEditorDate(null);
    setEditingId(null);
  }

  function updateDatePart(part, value) {
    const current = datePartsFromValue(form.date, editorDate);
    const next = updateDatePartValue(current, part, value);
    setForm((p) => ({ ...p, date: dateInputValue(next) }));
    setEditorDate(next);
    setDisplayYear(next.year);
    setDisplayMonth(next.month);
    return next;
  }

  if (editorDate !== null) {
    const dayEvents = eventsByKey[keyFor(editorDate.year, editorDate.month, editorDate.date)] || [];
    const canEditDateAndTime = true;
    const canSave = form.title.trim().length > 0 && parseDateInput(form.date) && toMinutes(form.end) > toMinutes(form.start);
    const selectedDate = datePartsFromValue(form.date, editorDate);

    return (
      <div className="calendar-edit-screen">
        <div className="edit-top-row">
          <button type="button" className="close-btn" onClick={() => { setEditorDate(null); }}>x</button>
          <button type="button" className="save-btn" disabled={!canSave} onClick={saveEvent}>Save</button>
        </div>

        <input
          className="title-input"
          placeholder="Add title"
          value={form.title}
          onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
        />

        <div className="type-row">
          <button type="button" className="type-pill active">Event</button>
          <button type="button" className="type-pill">Task</button>
          <button type="button" className="type-pill">Birthday</button>
        </div>

        {dayEvents.length > 0 ? (
          <div className="edit-existing">
            {dayEvents.map((event) => (
              <button key={event.id} type="button" onClick={() => loadEvent(event)} className="existing-pill">
                {event.title} {toTimeString(event.start)}-{toTimeString(event.end)}
              </button>
            ))}
          </div>
        ) : null}

        <div className="edit-block">
          <div className="line between">
            <span>All-day</span>
            <button
              type="button"
              className={`toggle ${form.allDay ? "on" : ""}`}
              onClick={() => setForm((p) => ({ ...p, allDay: !p.allDay }))}
            >
              <span />
            </button>
          </div>
          <div className="line between">
            <DateWheelFields
              disabled={!canEditDateAndTime}
              fieldId="start-date"
              selected={selectedDate}
              currentYear={currentDate.getFullYear()}
              onChoosePart={updateDatePart}
            />
            <input className="time-edit" type="time" value={form.start} disabled={!canEditDateAndTime} onChange={(e) => setForm((p) => ({ ...p, start: e.target.value }))} />
          </div>
          <div className="line between">
            <DateWheelFields
              disabled={!canEditDateAndTime}
              fieldId="end-date"
              selected={selectedDate}
              currentYear={currentDate.getFullYear()}
              onChoosePart={updateDatePart}
            />
            <input className="time-edit" type="time" value={form.end} disabled={!canEditDateAndTime} onChange={(e) => setForm((p) => ({ ...p, end: e.target.value }))} />
          </div>
          <div className="line"><span>Singapore Standard Time</span></div>
          <div className="line"><span>Does not repeat</span></div>
        </div>
        {editingId ? (
          <button type="button" className="delete-event-btn" onClick={removeEvent}>
            Delete event
          </button>
        ) : null}
      </div>
    );
  }

  const monthLabel = new Date(displayYear, displayMonth, 1).toLocaleDateString("en-US", { month: "long" });
  const weekRows = monthDays.length / 7;
  const latestUserEvent = [...visibleEvents].reverse().find((event) => (
    event.source === "Calendar" && !event.rigid
  ));
  const helperDoctorAppointment = helpers.rigidAppointments.find((appointment) => appointment.id === "sms-doctor-main");
  const targetDate = latestUserEvent
    ? {
        year: latestUserEvent.year ?? monthModel.year,
        month: latestUserEvent.month ?? monthModel.month,
        date: latestUserEvent.date,
      }
    : helperDoctorAppointment
      ? {
          year: helperDoctorAppointment.year,
          month: helperDoctorAppointment.month,
          date: helperDoctorAppointment.date,
        }
      : null;

  return (
    <div className="calendar-app">
      <div className="calendar-head">
        <h2>{monthLabel}</h2>
        <div className="calendar-controls">
          <button type="button" onClick={() => moveMonth(-1)}>{"<"}</button>
          <button type="button" onClick={() => moveMonth(1)}>{">"}</button>
        </div>
      </div>

      <div className="week-row">
        {monthModel.weekHeaders.map((d, idx) => (
          <span key={`${d}-${idx}`}>{d}</span>
        ))}
      </div>

      <div className="month-grid calendar-only-grid" style={{ gridTemplateRows: `repeat(${weekRows}, 1fr)` }}>
        {monthDays.map((day, idx) => {
          const dayEvents = eventsByKey[keyFor(day.year, day.month, day.date)] || [];
          const isToday = day.inMonth
            && day.date === helpers.todayDate
            && day.month === new Date().getMonth()
            && day.year === new Date().getFullYear();
          const isTargetDate = targetDate
            && day.date === targetDate.date
            && day.month === targetDate.month
            && day.year === targetDate.year;
          const hasTargetInMonth = targetDate && monthDays.some((item) => (
            item.date === targetDate.date
            && item.month === targetDate.month
            && item.year === targetDate.year
          ));
          const isLearnTargetDate = isTargetDate || (!hasTargetInMonth && isToday) || (
            day.inMonth
            && !hasTargetInMonth
            && !monthDays.some((item) => item.inMonth
              && item.date === helpers.todayDate
              && item.month === new Date().getMonth()
              && item.year === new Date().getFullYear())
            && day.date === 1
          );

          return (
            <button
              key={`${day.date}-${day.month}-${day.year}-${idx}`}
              type="button"
              className={`day-cell ${day.inMonth ? "" : "out"} ${isToday ? "today" : ""}`}
              data-learn-target={isLearnTargetDate ? "calendar-single-date" : undefined}
              data-calendar-date={isTargetDate ? "target" : undefined}
              onClick={() => openEditor(day)}
            >
              <div className="day-number">{day.date}</div>
              {dayEvents.slice(0, 2).map((event) => (
                <div key={event.id} className="chip">
                  {event.title}
                </div>
              ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}



