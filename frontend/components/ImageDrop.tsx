"use client";

import { useRef, useState } from "react";
import { ApiError, uploadImage } from "@/lib/api";
import {
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_LABEL,
  IDEAL_EDGE,
  ImageRejected,
  MIN_EDGE,
  prepareImage,
} from "@/lib/prepareImage";

type BaseProps = {
  label: string;
};

type SingleProps = BaseProps & {
  multiple?: false;
  value: string; // one URL ("" = none)
  onChange: (url: string) => void;
};

type MultiProps = BaseProps & {
  multiple: true;
  value: string[]; // gallery URLs
  onChange: (urls: string[]) => void;
};

type Props = SingleProps | MultiProps;

// Image uploader (drag or click). Single mode = one replaceable cover;
// multi = a removable thumbnail grid. Uploads immediately, returns the URL(s).
export function ImageDrop(props: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = props.multiple ? Array.from(files) : [files[0]];
    setBusy(true);
    setError(null);
    try {
      const urls: string[] = [];
      for (const f of list) {
        // Checked and resized before it goes anywhere: a 12MP photo used to
        // upload slowly and then fail the server's 5MB cap, and a 200px logo
        // uploaded fine and looked like a smear on every card.
        urls.push(await uploadImage(await prepareImage(f)));
      }
      if (props.multiple) {
        props.onChange([...props.value, ...urls]);
      } else {
        props.onChange(urls[0]);
      }
    } catch (e) {
      setError(
        e instanceof ImageRejected
          ? e.message
          : e instanceof ApiError
            ? e.status === 413
              ? "That image is too large (max 5 MB)."
              : "Upload failed. Please try again."
            : e instanceof Error
              ? e.message
              : "Upload failed.",
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const singleUrl = !props.multiple ? props.value : "";
  const galleryUrls = props.multiple ? props.value : [];

  return (
    <div>
      <p className="text-sm font-semibold text-muted">{props.label}</p>

      {/* existing thumbnails */}
      {!props.multiple && singleUrl && (
        <div className="mt-2">
          <Thumb url={singleUrl} onRemove={() => props.onChange("")} />
        </div>
      )}
      {props.multiple && galleryUrls.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {galleryUrls.map((url, idx) => (
            <Thumb
              key={url}
              url={url}
              onRemove={() =>
                props.onChange(galleryUrls.filter((_, i) => i !== idx))
              }
            />
          ))}
        </div>
      )}

      {/* drop zone */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
        aria-label={`${props.label}: drag an image here or click to choose a file`}
        className={`mt-2 grid w-full place-items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragOver
            ? "border-accent bg-accent/5"
            : "border-edge hover:border-accent/60"
        }`}
      >
        {busy ? (
          <span className="text-muted">Uploading…</span>
        ) : (
          <>
            <ImageGlyph />
            <span className="font-display text-lg font-semibold text-accent">
              {!props.multiple && singleUrl ? "Replace image" : "Add an image"}
            </span>
            <span className="text-base text-muted">
              Drag one here, or click to choose{props.multiple ? " (add more)" : ""}
            </span>
            {/* Said up front rather than as an error afterwards. People were
                uploading whatever they had and finding out on rejection. */}
            <span className="text-sm text-muted">
              {ACCEPTED_LABEL} · {IDEAL_EDGE}×{IDEAL_EDGE} works best · at least{" "}
              {MIN_EDGE}×{MIN_EDGE}
            </span>
          </>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        multiple={props.multiple}
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {error && <p className="mt-2 text-sm text-pop">{error}</p>}
    </div>
  );
}

function ImageGlyph() {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-muted"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="M21 15l-5-5-6.5 6.5L7 14l-4 4" />
    </svg>
  );
}

function Thumb({ url, onRemove }: { url: string; onRemove: () => void }) {
  return (
    <div className="relative h-24 w-32 overflow-hidden rounded-xl border border-edge bg-edge">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="h-full w-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove image"
        className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-ink/80 text-sm text-white hover:bg-ink"
      >
        ✕
      </button>
    </div>
  );
}
