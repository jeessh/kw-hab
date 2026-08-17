/**
 * Getting a listing photo into a shape the platform can actually use, before it
 * ever leaves the browser.
 *
 * Agencies upload whatever the phone or the designer handed them: a 12MP JPEG
 * straight off a camera, or a 200px logo scraped off their own website. The
 * first was rejected by the 5MB cap after a slow upload, which reads as "the
 * site is broken"; the second uploaded fine and then looked like a smear on
 * every card. Both are fixed here rather than argued about in an error message.
 */

/** What the uploader accepts. JPEG, PNG and WebP — the three every phone and
 *  design tool exports, and the three the storage bucket serves. */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const ACCEPTED_LABEL = "JPG, PNG or WebP";

/**
 * How big an image needs to be depends on what it's for.
 *
 * A listing photo fills a card several hundred pixels wide, so it needs the
 * pixels. A logo is drawn into a 56px ring and a 36px header avatar — asking an
 * agency for a 1000px version of a mark that renders at 56 is asking them to go
 * and find a file they may not have, to no benefit.
 */
export const IMAGE_SIZING = {
  /** Event covers: the photo is the card. */
  cover: { minEdge: 512, idealEdge: 1028 },
  /** Organization logos: recommended 512, and small marks are still usable. */
  logo: { minEdge: 128, idealEdge: 512 },
} as const;

export type SizingKey = keyof typeof IMAGE_SIZING;
/** Re-encode anything bigger than this; the API refuses at 5MB. */
const MAX_BYTES = 2 * 1024 * 1024;

export class ImageRejected extends Error {}

function loadBitmap(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageRejected("That file isn't an image we can read."));
    };
    img.src = url;
  });
}

/**
 * Validate, and shrink if it's worth shrinking.
 *
 * Throws ImageRejected with something a person can act on. Returns the original
 * File untouched when it's already a sensible size — re-encoding a good image
 * only costs it quality.
 */
export async function prepareImage(
  file: File,
  sizing: SizingKey = "cover",
): Promise<File> {
  const { minEdge: MIN_EDGE, idealEdge: IDEAL_EDGE } = IMAGE_SIZING[sizing];
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new ImageRejected(`Please choose a ${ACCEPTED_LABEL} image.`);
  }

  const img = await loadBitmap(file);
  const { naturalWidth: w, naturalHeight: h } = img;

  if (Math.min(w, h) < MIN_EDGE) {
    throw new ImageRejected(
      `That image is ${w}×${h}. Please use one at least ${MIN_EDGE}×${MIN_EDGE} — ` +
        `${IDEAL_EDGE}×${IDEAL_EDGE} looks best.`,
    );
  }

  const longest = Math.max(w, h);
  if (longest <= IDEAL_EDGE && file.size <= MAX_BYTES) return file;

  // Scale so the long edge lands on IDEAL_EDGE, keeping the aspect ratio. An
  // image that's already small enough but heavy still gets re-encoded.
  const scale = longest > IDEAL_EDGE ? IDEAL_EDGE / longest : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file; // no canvas: let the server's size cap decide
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // PNG keeps its transparency; everything else is cheaper as JPEG.
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, 0.85),
  );
  if (!blob || blob.size >= file.size) return file;

  return new File([blob], file.name.replace(/\.\w+$/, "") + extFor(type), {
    type,
  });
}

const extFor = (type: string) => (type === "image/png" ? ".png" : ".jpg");
