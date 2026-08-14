// Slugs mirror the backend ICON_POOL; keep in sync with core/icons.py.
export const ICON_EMOJI: Record<string, string> = {
  tree: "🌳",
  cat: "🐱",
  apple: "🍎",
  sun: "☀️",
  moon: "🌙",
  star: "⭐",
  dog: "🐶",
  fish: "🐟",
  flower: "🌸",
  house: "🏠",
  car: "🚗",
  boat: "⛵",
  heart: "❤️",
  cloud: "☁️",
  snow: "❄️",
  fire: "🔥",
  book: "📖",
  ball: "⚽",
  cake: "🍰",
  bell: "🔔",
  guitar: "🎸",
  rocket: "🚀",
  crown: "👑",
  gift: "🎁",
  camera: "📷",
  clock: "⏰",
  balloon: "🎈",
  diamond: "💎",
  mushroom: "🍄",
  cactus: "🌵",
  grapes: "🍇",
  lemon: "🍋",
  pizza: "🍕",
};

/**
 * The icons a member can choose from — mirrors ICON_POOL in core/icons.py.
 *
 * Listed explicitly rather than taken from the keys of ICON_EMOJI, because the
 * two answer different questions. This is what may be *chosen*; the map above
 * is what can be *drawn*, and it has to keep every slug that was ever issued so
 * an older account's key still renders as something other than a question mark.
 */
export const ALL_ICONS = [
  "tree",
  "cat",
  "apple",
  "sun",
  "moon",
  "dog",
  "fish",
  "flower",
  "house",
  "car",
  "heart",
  "star",
];

export function emojiFor(slug: string): string {
  return ICON_EMOJI[slug] ?? "❔";
}
