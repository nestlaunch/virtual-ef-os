import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualOS } from "../../state/VirtualOSContext";

const LOCATIONS = [
  { id: "ang-mo-kio-mrt", name: "Ang Mo Kio MRT", short: "AMK MRT", x: 22, y: 22, kind: "Train station" },
  { id: "hougang-mrt", name: "Hougang MRT", short: "HG MRT", x: 78, y: 32, kind: "Train station" },
  { id: "imh", name: "IMH", short: "IMH", x: 44, y: 70, kind: "Hospital" },
  { id: "hougang-polyclinic", name: "Hougang Polyclinic", short: "Polyclinic", x: 82, y: 76, kind: "Clinic" },
];

const ROUTE_TIMES = {
  "ang-mo-kio-mrt|hougang-mrt": { transit: 18, walk: 74, via: "Bus 165 / MRT transfer" },
  "ang-mo-kio-mrt|imh": { transit: 16, walk: 42, via: "Bus 88 / 159" },
  "ang-mo-kio-mrt|hougang-polyclinic": { transit: 29, walk: 86, via: "MRT + Bus 325" },
  "hougang-mrt|imh": { transit: 14, walk: 36, via: "Bus 161 / 325" },
  "hougang-mrt|hougang-polyclinic": { transit: 9, walk: 18, via: "Bus 325" },
  "imh|hougang-polyclinic": { transit: 12, walk: 24, via: "Bus 325 / local bus" },
};

const ROUTE_PATHS = {
  "ang-mo-kio-mrt|hougang-mrt": [
    [22, 22],
    [35, 25],
    [52, 28],
    [66, 30],
    [78, 32],
  ],
  "ang-mo-kio-mrt|imh": [
    [22, 22],
    [30, 36],
    [38, 50],
    [42, 61],
    [44, 70],
  ],
  "ang-mo-kio-mrt|hougang-polyclinic": [
    [22, 22],
    [35, 25],
    [52, 28],
    [68, 42],
    [78, 58],
    [82, 76],
  ],
  "hougang-mrt|imh": [
    [78, 32],
    [70, 42],
    [60, 53],
    [51, 62],
    [44, 70],
  ],
  "hougang-mrt|hougang-polyclinic": [
    [78, 32],
    [80, 45],
    [81, 61],
    [82, 76],
  ],
  "imh|hougang-polyclinic": [
    [44, 70],
    [56, 69],
    [68, 72],
    [82, 76],
  ],
};

const ROUTE_STEPS = {
  transit: [
    "Walk to the nearest bus stop.",
    "Take the suggested bus or MRT connection.",
    "Alight near the destination.",
    "Walk to the entrance and check the building name.",
  ],
  walk: [
    "Start walking from the current location.",
    "Follow the highlighted walking route.",
    "Use crossings at major roads.",
    "Arrive at the destination entrance.",
  ],
};

const LEARNING_STEPS = [
  "Choose where you are starting from.",
  "Choose where you want to go.",
  "Enter what time you want to leave.",
  "Choose Public transport or Walk.",
];

function routeKey(origin, destination) {
  const order = Object.fromEntries(LOCATIONS.map((location, index) => [location.id, index]));
  return [origin, destination].sort((a, b) => order[a] - order[b]).join("|");
}

function formatDuration(minutes) {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours} hr ${mins} min` : `${hours} hr`;
}

function addMinutes(time, minutes) {
  if (!time) {
    return "--:--";
  }
  const [hours, mins] = time.split(":").map(Number);
  const total = (hours * 60 + mins + minutes) % (24 * 60);
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function getLocation(id) {
  return LOCATIONS.find((location) => location.id === id);
}

function getRoutePoints(origin, destination) {
  const key = routeKey(origin, destination);
  const points = ROUTE_PATHS[key] ?? [];
  return key.split("|")[0] === origin ? points : [...points].reverse();
}

function MapPin({ location, active, muted }) {
  return (
    <div
      className={`maps-pin ${active ? "active" : ""} ${muted ? "muted" : ""}`}
      style={{ left: `${location.x}%`, top: `${location.y}%` }}
    >
      <span>{location.short}</span>
    </div>
  );
}

export function MapsApp() {
  const { state, helpers } = useVirtualOS();
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [leaveTime, setLeaveTime] = useState(() => helpers.minutesToClock(state.currentMinutes));
  const [mode, setMode] = useState("transit");
  const [modeTouched, setModeTouched] = useState(false);
  const [showRoute, setShowRoute] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const sheetDragStart = useRef(null);

  const route = useMemo(() => {
    const start = getLocation(origin);
    const end = getLocation(destination);
    const data = !origin || !destination || origin === destination ? null : ROUTE_TIMES[routeKey(origin, destination)];
    const points = data ? getRoutePoints(origin, destination) : [];
    const minutes = data ? data[mode] : 0;

    return {
      start,
      end,
      data,
      points: points.map(([x, y]) => `${x},${y}`).join(" "),
      minutes,
      arrival: data ? addMinutes(leaveTime, minutes) : "--:--",
    };
  }, [destination, leaveTime, mode, origin]);

  const completedSteps = [
    Boolean(origin),
    Boolean(destination),
    Boolean(leaveTime),
    modeTouched,
  ];

  const canShowRoute = Boolean(route.data && leaveTime && modeTouched);

  useEffect(() => {
    function handleBack(event) {
      if (!showRoute) {
        return;
      }
      event.preventDefault();
      setShowRoute(false);
      setSheetExpanded(false);
    }

    window.addEventListener("virtual-os-back", handleBack);
    return () => window.removeEventListener("virtual-os-back", handleBack);
  }, [showRoute]);

  useEffect(() => {
    if (!canShowRoute) {
      setShowRoute(false);
      setSheetExpanded(false);
    }
  }, [canShowRoute]);

  function handleRouteSubmit(event) {
    event.preventDefault();
    if (canShowRoute) {
      setShowRoute(true);
      setSheetExpanded(false);
    }
  }

  function chooseMode(nextMode) {
    setMode(nextMode);
    setModeTouched(true);
  }

  function handleSheetGrabberRelease(event) {
    const startY = sheetDragStart.current;
    sheetDragStart.current = null;

    if (startY === null) {
      setSheetExpanded((expanded) => !expanded);
      return;
    }

    const deltaY = event.clientY - startY;
    if (deltaY < -18) {
      setSheetExpanded(true);
      return;
    }
    if (deltaY > 18) {
      setSheetExpanded(false);
      return;
    }
    setSheetExpanded((expanded) => !expanded);
  }

  return (
    <div className="maps-app">
      <div className="maps-canvas" aria-label="Static practice map">
        <div className="maps-road horizontal" />
        <div className="maps-road vertical" />
        <div className="maps-road diagonal-one" />
        <div className="maps-road diagonal-two" />
        <div className="maps-green park-one">Park</div>
        <div className="maps-green park-two">Town</div>
        {route.data ? (
          <svg className="maps-route-line" viewBox="0 0 100 100" aria-hidden="true">
            <polyline points={route.points} className="route-shadow" />
            <polyline points={route.points} className={mode === "walk" ? "walk" : "transit"} />
            <circle cx={route.start.x} cy={route.start.y} r="2.8" className="route-endpoint" />
            <circle cx={route.end.x} cy={route.end.y} r="3.6" className="route-destination" />
          </svg>
        ) : null}
        {LOCATIONS.map((location) => (
          <MapPin
            key={location.id}
            location={location}
            active={location.id === origin || location.id === destination}
            muted={location.id !== origin && location.id !== destination}
          />
        ))}
      </div>

      <form className="maps-search-card" onSubmit={handleRouteSubmit}>
        <div className="maps-search-top">
          <button type="button" className="maps-menu-btn" aria-label="Menu">
            <span />
            <span />
            <span />
          </button>
          <div>
            <strong>Search here</strong>
            <span>Practice route planning</span>
          </div>
          <div className="maps-profile" aria-hidden="true">A</div>
        </div>

        <label className="maps-field">
          <span>Current location</span>
          <select value={origin} onChange={(event) => setOrigin(event.target.value)}>
            <option value="">Select current location</option>
            {LOCATIONS.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>

        <label className="maps-field">
          <span>Destination</span>
          <select value={destination} onChange={(event) => setDestination(event.target.value)}>
            <option value="">Select destination</option>
            {LOCATIONS.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>

        <div className="maps-route-options" role="group" aria-label="Route type">
          <button
            type="button"
            className={modeTouched && mode === "transit" ? "active" : ""}
            onClick={() => chooseMode("transit")}
          >
            Public transport
          </button>
          <button
            type="button"
            className={modeTouched && mode === "walk" ? "active" : ""}
            onClick={() => chooseMode("walk")}
          >
            Walk
          </button>
        </div>

        <div className="maps-bottom-row">
          <label className="maps-time-field">
            <span>Leave at</span>
            <input type="time" value={leaveTime} onChange={(event) => setLeaveTime(event.target.value)} />
          </label>
          <button type="submit" className="maps-directions-btn" disabled={!canShowRoute}>
            Directions
          </button>
        </div>

        {origin && destination && origin === destination ? (
          <p className="maps-error">Choose two different locations to see a route.</p>
        ) : null}
      </form>

      <section className={`maps-route-sheet ${showRoute ? "open" : ""} ${sheetExpanded ? "expanded" : ""}`} aria-live="polite">
        {route.data ? (
          <>
            <button
              type="button"
              className="maps-sheet-grabber"
              onPointerDown={(event) => {
                sheetDragStart.current = event.clientY;
              }}
              onPointerUp={handleSheetGrabberRelease}
              onClick={(event) => {
                if (event.detail === 0) {
                  setSheetExpanded((expanded) => !expanded);
                }
              }}
              aria-label={sheetExpanded ? "Collapse route details" : "Expand route details"}
            >
              <span className="maps-sheet-handle" />
            </button>
            <div className="maps-route-summary">
              <div>
                <strong>{formatDuration(route.minutes)}</strong>
                <span>{mode === "transit" ? route.data.via : "Walk directly"}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowRoute(false);
                  setSheetExpanded(false);
                }}
              >
                Close
              </button>
            </div>
            <div className="maps-sheet-scroll">
              <div className="maps-route-tabs" aria-label="Route choices">
                <span className="active">{formatDuration(route.minutes)}</span>
                <span>{mode === "transit" ? formatDuration(route.data.walk) : formatDuration(route.data.transit)}</span>
              </div>
              <div className="maps-route-detail">
                <div>
                  <span>From</span>
                  <strong>{route.start.name}</strong>
                </div>
                <div>
                  <span>To</span>
                  <strong>{route.end.name}</strong>
                </div>
                <div>
                  <span>Leave</span>
                  <strong>{leaveTime}</strong>
                </div>
                <div>
                  <span>Arrive</span>
                  <strong>{route.arrival}</strong>
                </div>
              </div>
              <ol className="maps-step-list">
                {ROUTE_STEPS[mode].map((step, index) => (
                  <li key={step}>
                    <span>{index + 1}</span>
                    <p>{step}</p>
                  </li>
                ))}
              </ol>
              <div className="maps-route-note">
                <strong>Practice reminder</strong>
                <p>Check the current location, destination, time, and route mode before starting the journey.</p>
              </div>
            </div>
          </>
        ) : null}
      </section>

      <aside className="maps-learning-card" aria-label="Learning checklist">
        <strong>Learning checklist</strong>
        {LEARNING_STEPS.map((step, index) => (
          <span key={step} className={completedSteps[index] ? "complete" : ""}>
            {completedSteps[index] ? "Done" : index + 1}. {step}
          </span>
        ))}
      </aside>
    </div>
  );
}
