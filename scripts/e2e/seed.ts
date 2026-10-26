import { Database } from "bun:sqlite";
const db = new Database(process.argv[2]);
const reader = db.query("select id from reader limit 1").get() as { id: string };
db.run("update reader set status='ready', error=null, published=1, course='Organisatieprocessen BC1' where id=?", [reader.id]);
db.run("delete from lesson where reader_id=?", [reader.id]);
const id = () => Math.random().toString(36).slice(2, 12);
const lessons = [
  ["1.1A", "Bedrijfskunde en organiseren", 1, 4, 8],
  ["1.1B", "Organisatiestructuren", 1, 8, 13],
  ["1.2A", "Informatievoorziening", 1, 14, 15],
  ["1.4A", "Processen en procesmanagement", 1, 21, 27],
  ["2.1A", "Processen op hoofdlijnen modelleren", 2, 35, 38],
];
lessons.forEach(([code, title, week, s, e], i) => {
  const lid = id();
  db.run(
    "insert into lesson (id, reader_id, code, title, week, position, start_page, end_page, status, summary, key_points, generated_at) values (?,?,?,?,?,?,?,?, 'ready', ?, ?, ?)",
    [lid, reader.id, code, title, week, i, s, e,
     `## ${title}\n\nBedrijfskunde is een **multidisciplinaire aanpak** voor het begrijpen en beheren van organisaties.\n\n- **Effectiviteit**: de juiste dingen doen\n- **Efficiëntie**: de dingen goed doen\n\n### Organisatiestructuur\nEen organisatie verdeelt taken en bevoegdheden, wat leidt tot een *hiërarchische structuur*.`,
     JSON.stringify(["Bedrijfskunde is multidisciplinair", "Effectiviteit ≠ efficiëntie", "Doelen leiden tot taakverdeling"]), Date.now()]);
  const terms = [["Bedrijfskunde", "Multidisciplinaire aanpak voor het begrijpen en beheren van organisaties."], ["Effectiviteit", "De mate waarin doelen worden bereikt."], ["Efficiëntie", "De verhouding tussen middelen en resultaat."], ["Strategisch management", "Formuleren en implementeren van langetermijnplannen."]];
  for (const [t, d] of terms) db.run("insert into term values (?,?,?,?)", [id(), lid, t, d]);
  for (const [t, d] of terms) db.run("insert into flashcard values (?,?,?,?)", [id(), lid, `Wat is ${t.toLowerCase()}?`, d]);
  const qs: [string, string, object, number][] = [
    ["mc", "Wat is het verschil tussen effectiviteit en efficiëntie?", { type: "mc", options: ["Effectiviteit = de juiste dingen doen, efficiëntie = de dingen goed doen", "Ze betekenen hetzelfde", "Efficiëntie gaat over doelen, effectiviteit over kosten", "Effectiviteit gaat alleen over winst"], answer: 0, explanation: "Effectiviteit gaat over doelbereik, efficiëntie over de inzet van middelen." }, 1],
    ["mc", "Welke discipline hoort NIET bij bedrijfskunde volgens de reader?", { type: "mc", options: ["Psychologie", "Economie", "Astronomie", "Sociologie"], answer: 2, explanation: "Bedrijfskunde gebruikt economie, psychologie, sociologie, statistiek en technologie." }, 2],
    ["tf", "Een tennisvereniging is ook een organisatie.", { type: "tf", answer: true, explanation: "Een organisatie is een groep mensen met een gezamenlijk doel." }, 1],
    ["tf", "HRM gaat over het beheer van financiële middelen.", { type: "tf", answer: false, explanation: "Dat is financieel management; HRM gaat over personeelszaken." }, 1],
    ["fill", "Bij ___ management worden langetermijnplannen geformuleerd en geïmplementeerd.", { type: "fill", answers: ["strategisch"], explanation: "Strategisch management richt zich op de lange termijn." }, 2],
    ["order", "Zet de stappen bij het opzetten van een organisatie in volgorde.", { type: "order", items: ["Doel definiëren", "Taken identificeren", "Taken en bevoegdheden toewijzen", "Hiërarchische structuur ontstaat"], explanation: "Doelen → taken → toewijzing → structuur." }, 3],
    ["open", "Leg uit waarom bedrijfskunde multidisciplinair is.", { type: "open", modelAnswer: "Omdat het concepten uit economie, psychologie, sociologie, statistiek en technologie combineert.", rubric: ["Noemt meerdere disciplines", "Legt verband met organisaties"] }, 2],
  ];
  for (const [type, prompt, data, d] of qs) db.run("insert into question values (?,?,?,?,?,?)", [id(), lid, type, prompt, JSON.stringify(data), d]);
});
console.log("seeded", reader.id);
