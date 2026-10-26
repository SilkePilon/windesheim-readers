import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicQuestion } from "@/lib/types";
import type { BattleSettings } from "@shared/battle";

// ---------- protocol types (server/live/battle.ts) ----------

export interface RankEntry {
  rank: number;
  id: string;
  name: string;
  score: number;
  streak: number;
}
export interface RoomMsg {
  t: "room";
  code: string;
  title: string;
  hostId: string;
  state: "lobby" | "countdown" | "question" | "reveal" | "ended";
  index: number;
  total: number;
  settings: BattleSettings;
  players: RankEntry[];
}
export interface QuestionMsg {
  t: "question";
  index: number;
  total: number;
  question: PublicQuestion;
  /** On this device's clock (corrected with the server's `serverNow`). */
  endsAt: number;
  durationMs: number;
  /** Points count double on this question. */
  doubled: boolean;
}
/** "Get ready" before the first question. */
export interface CountdownMsg {
  t: "countdown";
  /** On this device's clock (corrected with the server's `serverNow`). */
  endsAt: number;
  durationMs: number;
}
export interface RevealMsg {
  t: "reveal";
  index: number;
  correctAnswer: unknown;
  explanation: string;
  counts: Record<string, number>;
  results: Record<string, { answer: unknown; correct: boolean; points: number } | null>;
  ranking: RankEntry[];
}
export interface EndMsg {
  t: "end";
  ranking: RankEntry[];
  xp: Record<string, number>;
}

/** Server timestamps → this device's clock, so a skewed local clock can't eat the timer. */
const toLocal = (endsAt: number, serverNow: unknown) =>
  typeof serverNow === "number" ? endsAt - (serverNow - Date.now()) : endsAt;

export function useBattleSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const queue = useRef<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<RoomMsg | null>(null);
  const [countdown, setCountdown] = useState<CountdownMsg | null>(null);
  const [question, setQuestion] = useState<QuestionMsg | null>(null);
  const [reveal, setReveal] = useState<RevealMsg | null>(null);
  const [end, setEnd] = useState<EndMsg | null>(null);
  const [progress, setProgress] = useState<{ answered: number; total: number } | null>(null);
  const [answeredIndex, setAnsweredIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Back to "not in a battle": every piece of room state goes, the error/notice stays. */
  const resetRoom = useCallback(() => {
    setRoom(null);
    setCountdown(null);
    setQuestion(null);
    setReveal(null);
    setEnd(null);
    setProgress(null);
    setAnsweredIndex(null);
  }, []);

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    queue.current = [];
    setConnected(false);
    ws?.close();
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= 1) return wsRef.current;
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/battle/ws`);
    wsRef.current = ws;
    ws.onopen = () => {
      setConnected(true);
      for (const m of queue.current.splice(0)) ws.send(m);
    };
    // A replaced socket (leave, or StrictMode's dev remount) must not flip the state.
    ws.onclose = () => {
      if (wsRef.current === ws) setConnected(false);
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string);
      switch (msg.t) {
        case "room":
          setRoom(msg);
          break;
        case "countdown":
          setCountdown({ t: "countdown", endsAt: toLocal(msg.endsAt, msg.serverNow), durationMs: msg.durationMs });
          break;
        case "question":
          setCountdown(null);
          setQuestion({ ...msg, endsAt: toLocal(msg.endsAt, msg.serverNow) });
          setReveal(null);
          setProgress(null);
          break;
        case "reveal":
          setReveal(msg);
          break;
        case "end":
          setEnd(msg);
          break;
        case "progress":
          setProgress(msg);
          break;
        case "answered":
          setAnsweredIndex(msg.index);
          break;
        case "kicked":
          resetRoom();
          setError("KICKED");
          break;
        case "closed":
          // The host ended the battle (it's gone on the server, so drop the socket too).
          if (wsRef.current === ws) disconnect();
          resetRoom();
          setError("CLOSED");
          break;
        case "error":
          setError(msg.error);
          break;
      }
    };
    return ws;
  }, [disconnect, resetRoom]);

  const send = useCallback(
    (msg: unknown) => {
      setError(null);
      const ws = connect();
      const data = JSON.stringify(msg);
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
      else queue.current.push(data);
    },
    [connect],
  );

  /**
   * Walk out of the battle. `end` (host only) stops it for everyone; otherwise you leave
   * the room. Then the socket closes and all local battle state resets.
   */
  const leave = useCallback(
    (how: "leave" | "end" = "leave") => {
      const ws = wsRef.current;
      // Without an open socket the server already treats us as gone (onClose drops lobby
      // and countdown players); either way the local state resets below.
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: how }));
      disconnect();
      resetRoom();
      setError(null);
    },
    [disconnect, resetRoom],
  );

  useEffect(
    () => () => {
      wsRef.current?.close();
      wsRef.current = null;
      queue.current = [];
    },
    [],
  );

  return { connected, room, countdown, question, reveal, end, progress, answeredIndex, error, send, leave };
}

export type BattleSocket = ReturnType<typeof useBattleSocket>;
