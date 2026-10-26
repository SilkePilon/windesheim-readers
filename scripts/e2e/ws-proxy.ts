const s = new WebSocket("ws://localhost:5173/api/battle/ws");
s.onmessage = (e) => { console.log("msg via proxy:", e.data); process.exit(0); };
s.onerror = (e) => { console.log("ws error", e); process.exit(1); };
setTimeout(() => { console.log("timeout"); process.exit(1); }, 4000);
