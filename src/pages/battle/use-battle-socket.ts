import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicQuestion } from "@/lib/types";

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
  state: "lobby" | "question" | "reveal" | "ended";
  index: number;
  total: number;
  players: RankEntry[];
}
export interface QuestionMsg {
  t: "question";
  index: number;
  total: number;
  question: PublicQuestion;
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

export function useBattleSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const queue = useRef<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<RoomMsg | null>(null);
  const [question, setQuestion] = useState<QuestionMsg | null>(null);
  const [reveal, setReveal] = useState<RevealMsg | null>(null);
  const [end, setEnd] = useState<EndMsg | null>(null);
  const [progress, setProgress] = useState<{ answered: number; total: number } | null>(null);
  const [answeredIndex, setAnsweredIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        case "question":
          setQuestion(msg);
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
          setError("KICKED");
          setRoom(null);
          break;
        case "error":
          setError(msg.error);
          break;
      }
    };
    return ws;
  }, []);

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

  const leave = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
    setRoom(null);
    setQuestion(null);
    setReveal(null);
    setEnd(null);
    setAnsweredIndex(null);
  }, []);

  useEffect(
    () => () => {
      wsRef.current?.close();
      wsRef.current = null;
      queue.current = [];
    },
    [],
  );

  return { connected, room, question, reveal, end, progress, answeredIndex, error, send, leave };
}

export type BattleSocket = ReturnType<typeof useBattleSocket>;
