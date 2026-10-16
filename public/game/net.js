import { createConsumer } from "./vendor/actioncable.esm.js";

const consumer = createConsumer("/cable");
export const cid = Math.random().toString(36).slice(2, 10);

// Debug: ?lag=120&jitter=40 adds lag + random(0..jitter) ms to every message in each direction, order preserved.
const params = new URLSearchParams(location.search);
const LAG = Math.min(+params.get("lag") || 0, 2000), JITTER = Math.min(+params.get("jitter") || 0, 2000);
const delayed = (fn) => {
  if (!LAG && !JITTER) return fn;
  let at = 0;
  return (m) => {
    at = Math.max(at, performance.now() + LAG + Math.random() * JITTER);
    setTimeout(() => fn(m), at - performance.now());
  };
};

export function joinRoom(code, host, { onMsg, onConnected, onLost, onRejected }) {
  let sub;
  const open = () => {
    sub = consumer.subscriptions.create(
      { channel: "RoomChannel", code, cid, host },
      { connected: onConnected, disconnected: onLost, rejected: onRejected, received: delayed(onMsg) },
    );
  };
  open();
  return {
    send: delayed((msg) => sub.perform("relay", msg)),
    leave: () => sub.unsubscribe(),
    retry: open,
  };
}

export const newCode = () =>
  Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)]).join("");
