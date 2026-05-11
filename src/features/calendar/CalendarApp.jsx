import { useMemo, useState } from "react";
import { monthModel } from "../../state/seedData";
import { useVirtualOS } from "../../state/VirtualOSContext";

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

export function CalendarApp() {
  const { state, addEvent, updateEvent, helpers } = useVirtualOS();
  const [displayYear, setDisplayYear] = useState(monthModel.year);
  const [displayMonth, setDisplayMonth] = useState(monthModel.month);
  const [editorDate, setEditorDate] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    title: "",
    allDay: false,
    start: "15:30",
    end: "16:30",
  });

  const monthDays = useMemo(() => buildMonthDays(displayYear, displayMonth), [displayYear, displayMonth]);

  const eventsByKey = useMemo(() => {
    return state.events.reduce((acc, event) => {
      const y = event.year ?? monthModel.year;
      const m = event.month ?? monthModel.month;
      const k = keyFor(y, m, event.date);
      if (!acc[k]) {
        acc[k] = [];
      }
      acc[k].push(event);
      return acc;
    }, {});
  }, [state.events]);

  function openEditor(dayObj) {
    setEditorDate({ year: dayObj.year, month: dayObj.month, date: dayObj.date });
    setEditingId(null);
    setForm({ title: "", allDay: false, start: "15:30", end: "16:30" });
  }

  function loadEvent(event) {
    setEditingId(event.id);
    setForm({
      title: event.title,
      allDay: false,
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
    if (end <= start) {
      return;
    }

    if (editingId) {
      updateEvent(editingId, {
        title: form.title || "Untitled",
        start,
        end,
      });
    } else {
      const dt = new Date(editorDate.year, editorDate.month, editorDate.date);
      addEvent({
        id: `cal-${Date.now()}`,
        title: form.title || "Untitled",
        date: editorDate.date,
        month: editorDate.month,
        year: editorDate.year,
        day: mondayIndex(dt.getDay()),
        start,
        end,
        source: "Calendar",
        rigid: false,
      });
    }

    setEditorDate(null);
    setEditingId(null);
  }

  if (editorDate !== null) {
    const dayEvents = eventsByKey[keyFor(editorDate.year, editorDate.month, editorDate.date)] || [];

    return (
      <div className="calendar-edit-screen">
        <div className="edit-top-row">
          <button type="button" className="close-btn" onClick={() => setEditorDate(null)}>x</button>
          <button type="button" className="save-btn" onClick={saveEvent}>Save</button>
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
          <div className="line between"><span>{formatDateLabel(editorDate.year, editorDate.month, editorDate.date)}</span><input className="time-edit" type="time" value={form.start} onChange={(e) => setForm((p) => ({ ...p, start: e.target.value }))} /></div>
          <div className="line between"><span>{formatDateLabel(editorDate.year, editorDate.month, editorDate.date)}</span><input className="time-edit" type="time" value={form.end} onChange={(e) => setForm((p) => ({ ...p, end: e.target.value }))} /></div>
          <div className="line"><span>Singapore Standard Time</span></div>
          <div className="line"><span>Does not repeat</span></div>
        </div>
      </div>
    );
  }

  const monthLabel = new Date(displayYear, displayMonth, 1).toLocaleDateString("en-US", { month: "long" });
  const weekRows = monthDays.length / 7;

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

          return (
            <button
              key={`${day.date}-${day.month}-${day.year}-${idx}`}
              type="button"
              className={`day-cell ${day.inMonth ? "" : "out"} ${isToday ? "today" : ""}`}
              onClick={() => day.inMonth && openEditor(day)}
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


