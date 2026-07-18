import { useEffect } from "react";
import { liveStateStorageKey } from "./sessionStore";
import { getCloudApiBaseUrl, getCloudSyncIntervalMs, syncCloudState } from "./cloudSync";

export function useVirtualOSCloudSync({ state, stateRef, dispatch, immediateCloudSyncRef }) {
  useEffect(() => {
    const pin = String(state.session.pin || "").trim().toUpperCase();
    const isAdminClient = window.location.pathname.replace(/\/+$/, "") === "/admin";
    const shouldConnect = isAdminClient || Boolean(state.session.joined && state.session.currentUserId);
    if (!shouldConnect || typeof WebSocket === "undefined" || !/^[A-Z0-9]{6}$/.test(pin) || window.location.protocol === "file:") {
      return undefined;
    }

    let socket;
    let reconnectTimer;
    let stopped = false;

    const connect = () => {
      const liveUrl = new URL(`/api/sessions/${pin}/live`, getCloudApiBaseUrl() || window.location.origin);
      liveUrl.protocol = liveUrl.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(liveUrl.toString());
      socket.addEventListener("open", () => {
        socket.send(JSON.stringify({ type: "get_snapshot" }));
      });
      socket.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.type === "snapshot" && payload.snapshot?.session) {
            dispatch({ type: "HYDRATE_LIVE_STATE", snapshot: payload.snapshot });
          }
        } catch {
          // Polling remains available if a live message is malformed.
        }
      });
      socket.addEventListener("close", () => {
        if (!stopped) {
          reconnectTimer = window.setTimeout(connect, 1500);
        }
      });
    };

    connect();
    return () => {
      stopped = true;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [dispatch, state.session.currentUserId, state.session.joined, state.session.pin]);

  useEffect(() => {
    if (!immediateCloudSyncRef.current) {
      return;
    }
    immediateCloudSyncRef.current = false;
    syncCloudState(state, { force: true }).then((snapshot) => {
      if (snapshot?.session) {
        dispatch({ type: "HYDRATE_LIVE_STATE", snapshot });
      }
    });
  }, [dispatch, immediateCloudSyncRef, state]);

  useEffect(() => {
    function onStorage(event) {
      if (event.key !== liveStateStorageKey() || !event.newValue) {
        return;
      }
      try {
        const snapshot = JSON.parse(event.newValue);
        if (snapshot?.session) {
          dispatch({ type: "HYDRATE_LIVE_STATE", snapshot });
        }
      } catch {
        // Ignore malformed sync payloads.
      }
    }

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [dispatch]);

  useEffect(() => {
    const syncCurrentState = () => {
      syncCloudState(stateRef.current).then((snapshot) => {
        if (snapshot?.session) {
          dispatch({ type: "HYDRATE_LIVE_STATE", snapshot });
        }
      });
    };
    const timer = window.setInterval(syncCurrentState, getCloudSyncIntervalMs());
    syncCurrentState();
    return () => window.clearInterval(timer);
  }, [dispatch, stateRef]);
}
