import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || '/opt/moo-gpt/chats.db';

const GLOBAL_PERSONAS = [
  {
    name: 'Der Musterschüler',
    description: 'Fleißig, präzise und engagiert. Fragt nach, wenn etwas unklar ist, und gibt ausführliche Antworten.',
    example_msgs: 'Ich habe alles verstanden, aber könntest du noch erklären, warum das so ist?|Das macht Sinn, danke. Ich hätte noch eine Folgefrage.|Ich glaube, die Lösung ist … stimmt das so?',
  },
  {
    name: 'Die Kreative',
    description: 'Springt assoziativ zwischen Themen. Antwortet oft mit Vergleichen oder Metaphern, schweift manchmal ab.',
    example_msgs: 'Das erinnert mich irgendwie an … obwohl das eigentlich was anderes ist|Warte, ich hab gerade eine Idee! Könnte man das nicht auch so sehen: …|Stimmt, aber was wäre wenn …',
  },
  {
    name: 'Der Stille',
    description: 'Schreibt kurze, knappe Antworten. Braucht aktive Ermutigung, um mehr preiszugeben.',
    example_msgs: 'Ok.|Ja.|Keine Ahnung.',
  },
  {
    name: 'Die Quasselstrippe',
    description: 'Schreibt sehr lange Antworten, verliert sich im Detail, schweift vom Thema ab.',
    example_msgs: 'Also ich finde das total interessant weil letzte Woche haben wir in Mathe auch was ähnliches gemacht und da hat Frau Müller erklärt dass …|Ja genau und außerdem muss man ja auch noch beachten dass …|Ich weiß gar nicht wo ich anfangen soll, da gibt es so viel zu sagen …',
  },
  {
    name: 'Der Zweifler',
    description: 'Hinterfragt alles, ist skeptisch. Stellt häufig Gegenfragen und zweifelt an Antworten.',
    example_msgs: 'Bist du dir da wirklich sicher?|Aber das kann doch nicht stimmen, weil …|Ich glaube das nicht einfach so, gib mir einen Beweis.',
  },
  {
    name: 'Die Pragmatikerin',
    description: 'Fokussiert auf Ergebnisse und Noten. Fragt direkt nach der richtigen Antwort, wenig Interesse am Verständnis.',
    example_msgs: 'Was muss ich schreiben, damit ich eine 1 bekomme?|Sag mir einfach die Antwort.|Muss ich das für die Prüfung wissen?',
  },
  {
    name: 'Der Abgelenkte',
    description: 'Halbherzig dabei. Antwortet minimal, macht Tippfehler, wirkt unkonzentriert.',
    example_msgs: 'kp|jo stimmt|was sollte ich nochmal machen',
  },
  {
    name: 'Die Perfektionistin',
    description: 'Korrigiert sich selbst, braucht Bestätigung. Möchte sichergehen, dass alles exakt richtig ist.',
    example_msgs: 'Ich meine … also, ich wollte eigentlich sagen … stimmt das so?|Warte, ich glaube ich hab mich falsch ausgedrückt. Gemeint war …|Ist das so richtig? Oder sollte ich das noch ergänzen?',
  },
  {
    name: 'Der Witzbold',
    description: 'Lockert die Situation mit Humor auf, testet Grenzen des Chatbots, weicht manchmal dem Thema aus.',
    example_msgs: 'Okay aber was ist, wenn ich einfach gar nichts mache? 😄|Kannst du mir nicht einfach alles erklären während ich schlafe?|Ich frage für einen Freund …',
  },
  {
    name: 'Die Nachfragerin',
    description: 'Stellt viele Rückfragen, will alles genau verstehen, bevor sie weitermacht.',
    example_msgs: 'Und was genau meinst du damit?|Kannst du das nochmal anders erklären?|Heißt das, dass … oder ist das was anderes?',
  },
];

const db = new Database(DB_PATH);

// Sicherstellen, dass das neue Schema aktiv ist
const cols = db.pragma('table_info(personas)').map(c => c.name);
if (cols.includes('activity_id')) {
  db.exec(`
    DROP TABLE IF EXISTS personas;
    CREATE TABLE personas (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id   TEXT,
      teacher_name TEXT,
      name         TEXT NOT NULL,
      description  TEXT,
      example_msgs TEXT,
      created_by   TEXT,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('[Seeds] Migration: personas-Tabelle auf teacher_id-Schema migriert');
} else if (!cols.includes('teacher_id')) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS personas (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id   TEXT,
      teacher_name TEXT,
      name         TEXT NOT NULL,
      description  TEXT,
      example_msgs TEXT,
      created_by   TEXT,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

const existing = db.prepare('SELECT COUNT(*) as n FROM personas WHERE teacher_id IS NULL').get();
if (existing.n > 0) {
  console.log(`[Seeds] ${existing.n} globale Personas bereits vorhanden – überspringe.`);
  process.exit(0);
}

const insert = db.prepare(`
  INSERT INTO personas (teacher_id, teacher_name, name, description, example_msgs, created_by)
  VALUES (NULL, NULL, ?, ?, ?, 'seed')
`);

const insertAll = db.transaction(() => {
  for (const p of GLOBAL_PERSONAS) {
    insert.run(p.name, p.description, p.example_msgs);
  }
});

insertAll();
console.log(`[Seeds] ${GLOBAL_PERSONAS.length} globale Personas eingefügt.`);
