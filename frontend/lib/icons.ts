// Slugs mirror the backend ICON_POOL; keep in sync with core/icons.py.
export const ICON_EMOJI: Record<string, string> = {
  tree: "🌳",
  cat: "🐱",
  apple: "🍎",
  sun: "☀️",
  moon: "🌙",
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

/** All selectable icon slugs, in a stable display order. */
export const ALL_ICONS = Object.keys(ICON_EMOJI);

export function emojiFor(slug: string): string {
  return ICON_EMOJI[slug] ?? "❔";
}
