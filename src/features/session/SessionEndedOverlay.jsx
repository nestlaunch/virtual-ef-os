import { useEffect, useState } from "react";
import { useVirtualOS } from "../../state/VirtualOSContext";

export function SessionEndedOverlay() {
  const { state, submitExperienceRating } = useVirtualOS();
  const [now, setNow] = useState(Date.now());
  const [rating, setRating] = useState(state.session.experienceRatings[state.session.currentUserId] || 0);

  useEffect(() => {
    if (!state.session.endingStartedAt) {
      return undefined;
    }
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [state.session.endingStartedAt]);

  if (!state.session.endingStartedAt || !state.session.joined) {
    return null;
  }

  const remainingMs = Math.max(0, (state.session.endedAt || state.session.endingStartedAt) - now);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const isEnded = remainingMs <= 0;

  if (!isEnded) {
    return (
      <aside className="session-ending-toast">
        Session ending in {remainingSeconds}s
      </aside>
    );
  }

  return (
    <section className="session-ended-overlay" role="dialog" aria-modal="true" aria-label="Session ended">
      <div className="session-ended-card">
        <span>Session ended</span>
        <h2>Thank you</h2>
        <p>Your practice session has ended. Please rate your experience.</p>
        <div className="star-rating" aria-label="Rate experience">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              className={star <= rating ? "active" : ""}
              onClick={() => setRating(star)}
              aria-label={`${star} star${star === 1 ? "" : "s"}`}
            >
              ★
            </button>
          ))}
        </div>
        <button
          type="button"
          className="session-submit-btn"
          disabled={!rating}
          onClick={() => submitExperienceRating(rating)}
        >
          SUBMIT
        </button>
      </div>
    </section>
  );
}
