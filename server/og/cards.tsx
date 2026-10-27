/**
 * Link-preview cards (1200×630) in the Speelveld style, as satori element trees (flexbox
 * only; every div with more than one child needs `display: flex`). See server/og/render.ts.
 */
import type { CSSProperties, ReactNode } from "react";
import { OG_COPY, type OgLang } from "./copy";
import { drawable } from "./render";

export const P = {
  lilac: "#F1ECFF",
  lilac2: "#E2DAFF",
  chunky: "#D9CEFF",
  grape: "#1B1536",
  ink: "#241A4A",
  muted: "#7A6FA8",
  primary: "#6B3CF6",
  primaryShade: "#4A22C4",
  mint: "#19C59B",
  mintShade: "#0E9474",
  pink: "#FF5C8A",
  pinkShade: "#D63A68",
  blue: "#3E8BFF",
  blueShade: "#2066D6",
  gold: "#FFC83D",
  goldShade: "#E0A100",
  orange: "#FF8A1F",
  orangeShade: "#D46A0A",
  white: "#FFFFFF",
};

const FONT_HEAD = "Fredoka";
const FONT_BODY = "Nunito";

/** public/brand/logo.svg, inlined so the server never depends on the static files. */
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect x="8" y="12" width="50" height="50" rx="14" fill="#D93E6C"/><rect x="8" y="6" width="50" height="50" rx="14" fill="#FF5C8A"/><rect x="62" y="12" width="50" height="50" rx="14" fill="#2366D1"/><rect x="62" y="6" width="50" height="50" rx="14" fill="#3D8BFF"/><rect x="8" y="66" width="50" height="50" rx="14" fill="#E0A800"/><rect x="8" y="60" width="50" height="50" rx="14" fill="#FFC93C"/><rect x="62" y="66" width="50" height="50" rx="14" fill="#13A07B"/><rect x="62" y="60" width="50" height="50" rx="14" fill="#1FC59A"/><path d="M33 20 L45 41 L21 41 Z" fill="#fff" stroke="#fff" stroke-width="4" stroke-linejoin="round"/><path d="M87 18 L99 31 L87 44 L75 31 Z" fill="#fff" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><circle cx="33" cy="85" r="12" fill="#5A3A00"/><rect x="76" y="74" width="22" height="22" rx="5" fill="#fff"/></svg>`;
const LOGO_URI = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString("base64")}`;

export const svgUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

const Logo = ({ size }: { size: number }) => <img src={LOGO_URI} width={size} height={size} style={{ width: size, height: size }} />;

// Lucide icon paths (ISC), drawn as inline svg.
const ICONS = {
  layers: [
    "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z",
    "M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12",
    "M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17",
  ],
  check: ["M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0", "m16 9-5.5 5.5L8 12"],
  headphones: ["M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"],
  swords: [
    "M14.5 17.5 3.586 6.586A2 2 0 013 5.172V3h2.172a2 2 0 011.414.586L17.5 14.5",
    "m13 19 6-6",
    "m16 16 4 4",
    "m19 21 2-2",
    "m14.828 6.172 2.586-2.586A2 2 0 0118.828 3H21v2.172a2 2 0 01-.586 1.414l-2.586 2.586",
    "m5 14 4 4",
    "m5 21-2-2",
    "M7.5 16.5 4 20",
  ],
  book: ["M12 7v14", "M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z"],
  crown: [
    "M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z",
    "M5 21h14",
  ],
  zap: ["M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z"],
  timer: ["M10 2h4", "m12 14 3-3", "M20 14a8 8 0 1 1-16 0 8 8 0 0 1 16 0"],
  users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M16 3.128a4 4 0 0 1 0 7.744", "M22 21v-2a4 4 0 0 0-3-3.87", "M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0"],
} as const;
type IconName = keyof typeof ICONS;

const Icon = ({ name, size, color, stroke = 2.4 }: { name: IconName; size: number; color: string; stroke?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    {ICONS[name].map((d) => (
      <path key={d} d={d} />
    ))}
  </svg>
);

/** Chunky pill: solid colour, a darker lip below. */
function Chip({ color, shade, text, icon, textColor = P.white, size = 26 }: { color: string; shade: string; text: string; icon?: IconName; textColor?: string; size?: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: color,
        boxShadow: `0 6px 0 ${shade}`,
        borderRadius: 999,
        padding: icon ? `10px 22px 10px 16px` : "10px 22px",
        color: textColor,
        fontFamily: FONT_BODY,
        fontWeight: 900,
        fontSize: size,
        lineHeight: 1,
      }}
    >
      {icon ? <Icon name={icon} size={size + 2} color={textColor} stroke={2.6} /> : null}
      <span>{text}</span>
    </div>
  );
}

const Abs = ({ style, children }: { style: CSSProperties; children?: ReactNode }) => (
  <div style={{ position: "absolute", display: "flex", ...style }}>{children}</div>
);

// --------------------------------------------------------------------------- default card

export interface DefaultCardOpts {
  lang: OgLang;
  /** Art panel content (a slice of the lesson world), `DEFAULT_ART_SIZE` minus the 6px border. */
  art?: ReactNode;
}

/** The art panel (inside its 6px white frame). */
export const DEFAULT_ART_SIZE = { width: 420, height: 522 };
const ART_LEFT = 1200 - 54 - DEFAULT_ART_SIZE.width;
const ART_TOP = 46;

/** The site-wide card: logo, big title, tagline, feature chips and a slice of the lesson world. */
export function DefaultCard({ lang, art }: DefaultCardOpts) {
  const t = OG_COPY[lang];
  const chips: [string, string, IconName][] = [
    [P.pink, P.pinkShade, "layers"],
    [P.blue, P.blueShade, "check"],
    [P.mint, P.mintShade, "headphones"],
    [P.gold, P.goldShade, "swords"],
  ];
  return (
    <div style={{ display: "flex", width: 1200, height: 630, background: P.lilac, position: "relative", fontFamily: FONT_BODY }}>
      <Confetti tint="light" />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 0 0 72px", width: 680 }}>
        <Logo size={96} />
        <div style={{ display: "flex", flexDirection: "column", marginTop: 26, fontFamily: FONT_HEAD, fontWeight: 700, lineHeight: 0.95, letterSpacing: -2 }}>
          <span style={{ fontSize: 104, color: P.ink }}>Windesheim</span>
          <span style={{ fontSize: 104, color: P.primary }}>Readers</span>
        </div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 36, fontWeight: 800, color: P.muted }}>{t.tagline}</div>
        <div style={{ display: "flex", gap: 12, marginTop: 36 }}>
          {t.features.map((f, i) => {
            const [c, s, icon] = chips[i]!;
            return <Chip key={f} color={c} shade={s} text={f} icon={icon} textColor={i === 3 ? P.ink : P.white} size={20} />;
          })}
        </div>
      </div>
      {/* White frame with a chunky lip, the art inset 6px. */}
      <Abs
        style={{
          left: ART_LEFT - 6,
          top: ART_TOP - 6,
          width: DEFAULT_ART_SIZE.width + 12,
          height: DEFAULT_ART_SIZE.height + 12,
          borderRadius: 32,
          background: P.white,
          boxShadow: `0 8px 0 ${P.chunky}`,
        }}
      />
      <Abs
        style={{
          left: ART_LEFT,
          top: ART_TOP,
          width: DEFAULT_ART_SIZE.width,
          height: DEFAULT_ART_SIZE.height,
          borderRadius: 26,
          overflow: "hidden",
          background: P.mint,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {art ?? <CodeTiles digits={["W", "R"]} w={120} h={140} font={100} />}
      </Abs>
    </div>
  );
}

// --------------------------------------------------------------------------- battle cards

export interface BattleCardData {
  code: string;
  status: "lobby" | "playing" | "ended";
  hostName: string;
  lessonCode: string;
  lessonTitle: string;
  moreLessons: number;
  playerCount: number;
  settings: {
    count: number;
    questionSeconds: number;
    points: "normal" | "lastDouble" | "allDouble";
    difficulty: "easy" | "mixed" | "hard";
  };
}

/** Big shapes from the logo, scattered faintly over the backdrop. */
function Confetti({ tint }: { tint: "light" | "dark" }) {
  const a = tint === "light" ? "#E4DBFF" : "rgba(255,255,255,0.09)";
  const b = tint === "light" ? "#EAE3FF" : "rgba(255,255,255,0.06)";
  const tri = (x: number, y: number, s: number, c: string) =>
    `<path d="M${x} ${y - s} L${x + s * 1.1} ${y + s * 0.8} L${x - s * 1.1} ${y + s * 0.8} Z" fill="${c}" stroke="${c}" stroke-width="${s * 0.3}" stroke-linejoin="round"/>`;
  const dia = (x: number, y: number, s: number, c: string) =>
    `<path d="M${x} ${y - s} L${x + s} ${y} L${x} ${y + s} L${x - s} ${y} Z" fill="${c}" stroke="${c}" stroke-width="${s * 0.25}" stroke-linejoin="round"/>`;
  const sq = (x: number, y: number, s: number, r: number, c: string) =>
    `<rect x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" rx="${s * 0.24}" fill="${c}" transform="rotate(${r} ${x} ${y})"/>`;
  const dot = (x: number, y: number, r: number, c: string) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
  const shapes =
    tint === "light"
      ? dot(-10, -10, 80, a) + tri(40, 640, 70, a) + dia(640, 52, 26, a) + sq(612, 586, 54, -14, b) + dot(1180, 610, 46, b) + dia(1176, 300, 22, b)
      : tri(120, 470, 52, a) + dia(1130, 85, 45, b) + dot(640, 600, 56, b) + sq(1135, 525, 110, 14, a) + dot(30, 40, 44, a) + dia(560, 70, 30, a) + sq(410, 590, 60, -12, a);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">${shapes}</svg>`;
  return <img src={svgUri(svg)} width={1200} height={630} style={{ position: "absolute", left: 0, top: 0 }} />;
}

const TILE_SHADES = [P.pink, P.blue, P.gold, P.mint];

/** One chunky tile per character, the lip cycling through the brand colours. */
function CodeTiles({ digits, ghost = false, w = 124, h = 148, font = 112 }: { digits: string[]; ghost?: boolean; w?: number; h?: number; font?: number }) {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", margin: "auto" }}>
      {digits.map((d, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: w,
            height: h,
            borderRadius: 26,
            background: ghost ? "rgba(255,255,255,0.16)" : P.white,
            border: ghost ? "4px dashed rgba(255,255,255,0.55)" : "none",
            boxShadow: ghost ? "none" : `0 10px 0 ${TILE_SHADES[i % TILE_SHADES.length]}`,
            color: ghost ? "rgba(255,255,255,0.85)" : P.ink,
            fontFamily: FONT_HEAD,
            fontWeight: 700,
            fontSize: font,
            lineHeight: 1,
            paddingBottom: 6,
          }}
        >
          {d}
        </div>
      ))}
    </div>
  );
}

const STATUS_STYLE = {
  lobby: { bg: P.mint, shade: P.mintShade, dot: "#CFFFEF" },
  playing: { bg: P.gold, shade: P.goldShade, dot: P.ink },
  ended: { bg: "#9C90C9", shade: "#7568A8", dot: P.white },
} as const;

function StatusPill({ status, text }: { status: BattleCardData["status"]; text: string }) {
  const s = STATUS_STYLE[status];
  const fg = status === "playing" ? P.ink : P.white;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: s.bg,
        boxShadow: `0 6px 0 ${s.shade}`,
        borderRadius: 999,
        padding: "12px 26px 12px 20px",
        color: fg,
        fontFamily: FONT_BODY,
        fontWeight: 900,
        fontSize: 28,
        lineHeight: 1,
      }}
    >
      <div style={{ display: "flex", width: 16, height: 16, borderRadius: 999, background: s.dot, boxShadow: `0 0 0 5px rgba(255,255,255,0.35)` }} />
      <span>{text}</span>
    </div>
  );
}

function TopBar({ right }: { right?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Logo size={60} />
        <span style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 34, color: P.white, letterSpacing: -0.5 }}>Windesheim Readers</span>
      </div>
      {right}
    </div>
  );
}

const AVATAR_COLORS = [P.pink, P.blue, P.gold, P.mint, P.orange, "#B49BFF"];

function AvatarDots({ count }: { count: number }) {
  const shown = Math.min(count, 6);
  const extra = count - shown;
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {Array.from({ length: Math.max(shown, 1) }, (_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            width: 44,
            height: 44,
            borderRadius: 999,
            marginLeft: i === 0 ? 0 : -12,
            background: count === 0 ? P.lilac2 : AVATAR_COLORS[i % AVATAR_COLORS.length],
            border: `4px solid ${P.white}`,
          }}
        />
      ))}
      {extra > 0 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 44,
            minWidth: 44,
            padding: "0 10px",
            marginLeft: -12,
            borderRadius: 999,
            background: P.ink,
            border: `4px solid ${P.white}`,
            color: P.white,
            fontFamily: FONT_BODY,
            fontWeight: 900,
            fontSize: 18,
          }}
        >
          +{extra}
        </div>
      ) : null}
    </div>
  );
}

/** Label over value, with a coloured icon tile in front. */
function InfoCell({ icon, color, shade, label, value, width, lines = 1 }: { icon: ReactNode; color: string; shade: string; label: string; value: string; width: number; lines?: 1 | 2 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, width }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 68,
          height: 68,
          flexShrink: 0,
          borderRadius: 20,
          background: color,
          boxShadow: `0 6px 0 ${shade}`,
        }}
      >
        {icon}
      </div>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flexGrow: 1 }}>
        <span style={{ fontFamily: FONT_BODY, fontWeight: 900, fontSize: 18, color: P.muted, textTransform: "uppercase", letterSpacing: 1.5 }}>{label}</span>
        {lines === 1 ? (
          <span style={{ display: "block", fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 32, color: P.ink, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {value}
          </span>
        ) : (
          <span style={{ display: "block", fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 27, color: P.ink, lineHeight: 1.1, lineClamp: 2, overflow: "hidden" }}>{value}</span>
        )}
      </div>
    </div>
  );
}

const initial = (name: string) => [...name.trim()][0]?.toUpperCase() ?? "?";

/** The live room invite: code tiles, host, lesson, players, status and settings. */
export function BattleCard({ data: raw, lang }: { data: BattleCardData; lang: OgLang }) {
  const t = OG_COPY[lang].battle;
  const data = { ...raw, hostName: drawable(raw.hostName) || t.host, lessonCode: drawable(raw.lessonCode), lessonTitle: drawable(raw.lessonTitle) };
  const s = data.settings;
  const points = t.points[s.points];
  const difficulty = t.difficulty[s.difficulty];
  const badges: { text: string; icon: IconName }[] = [
    { text: t.questions(s.count), icon: "check" },
    { text: t.seconds(s.questionSeconds), icon: "timer" },
    ...(points ? [{ text: points, icon: "zap" as const }] : []),
    ...(difficulty ? [{ text: difficulty, icon: "crown" as const }] : []),
  ];
  const lessonLabel = [`${t.lesson} ${data.lessonCode}`.trim(), data.moreLessons > 0 ? t.moreLessons(data.moreLessons) : ""].filter(Boolean).join(" · ");
  return (
    <Backdrop>
      <TopBar right={<StatusPill status={data.status} text={t.status[data.status]} />} />
      <div style={{ display: "flex", justifyContent: "center", marginTop: 14, fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 56, color: P.white, letterSpacing: -1 }}>
        {data.status === "ended" ? t.ended : t.join}
      </div>
      <div style={{ display: "flex", marginTop: 18 }}>
        <CodeTiles digits={[...data.code]} />
      </div>
      <GlassChips items={badges} />
      <InfoCard>
        <InfoCell
          width={300}
          color={P.pink}
          shade={P.pinkShade}
          icon={<span style={{ fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 38, color: P.white, lineHeight: 1 }}>{initial(data.hostName)}</span>}
          label={t.host}
          value={data.hostName}
        />
        <InfoCell
          width={460}
          color={P.blue}
          shade={P.blueShade}
          icon={<Icon name="book" size={36} color={P.white} />}
          label={lessonLabel}
          value={data.lessonTitle || data.lessonCode || t.title}
          lines={2}
        />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, width: 200 }}>
          <AvatarDots count={data.playerCount} />
          <span style={{ fontFamily: FONT_HEAD, fontWeight: 600, fontSize: 30, color: P.ink }}>{t.players(data.playerCount)}</span>
        </div>
      </InfoCard>
    </Backdrop>
  );
}

/** Any code that isn't (or no longer is) a live room: a generic invite. */
export function GenericBattleCard({ lang }: { lang: OgLang }) {
  const t = OG_COPY[lang].battle;
  return (
    <Backdrop>
      <TopBar right={<Chip color={P.gold} shade={P.goldShade} textColor={P.ink} text={t.live} icon="zap" size={26} />} />
      <div style={{ display: "flex", justifyContent: "center", marginTop: 14, fontFamily: FONT_HEAD, fontWeight: 700, fontSize: 56, color: P.white, letterSpacing: -1 }}>
        {t.title}
      </div>
      <div style={{ display: "flex", marginTop: 18 }}>
        <CodeTiles digits={["?", "?", "?", "?", "?", "?"]} ghost />
      </div>
      <GlassChips
        items={[
          { text: t.kahoot, icon: "users" },
          { text: t.podium, icon: "crown" },
        ]}
      />
      <InfoCard>
        <InfoCell width={1000} color={P.gold} shade={P.goldShade} icon={<Icon name="swords" size={36} color={P.ink} />} label={t.joinGeneric} value={t.howTo} />
      </InfoCard>
    </Backdrop>
  );
}

/** Translucent pills on the purple backdrop (settings, features). */
function GlassChips({ items }: { items: { text: string; icon: IconName }[] }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 30 }}>
      {items.map((b) => (
        <div
          key={b.text}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(255,255,255,0.16)",
            borderRadius: 999,
            padding: "8px 18px 8px 14px",
            color: P.white,
            fontFamily: FONT_BODY,
            fontWeight: 800,
            fontSize: 22,
          }}
        >
          <Icon name={b.icon} size={22} color={P.white} stroke={2.6} />
          <span>{b.text}</span>
        </div>
      ))}
    </div>
  );
}

function Backdrop({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        width: 1200,
        height: 630,
        position: "relative",
        backgroundColor: P.primary,
        backgroundImage: `radial-gradient(circle at 50% 38%, #8A63FF 0%, ${P.primary} 55%, #5428E0 100%)`,
      }}
    >
      <Confetti tint="dark" />
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "34px 56px 0" }}>{children}</div>
    </div>
  );
}

function InfoCard({ children }: { children: ReactNode }) {
  return (
    <Abs
      style={{
        left: 56,
        right: 56,
        bottom: 36,
        height: 128,
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 34px",
        borderRadius: 28,
        background: P.white,
        boxShadow: `0 8px 0 ${P.primaryShade}`,
      }}
    >
      {children}
    </Abs>
  );
}
