"use client";

import { useRef, useState } from "react";
import { ApiError, uploadImage } from "@/lib/api";

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
        if (!f.type.startsWith("image/")) {
          throw new Error("Please choose an image file.");
        }
        urls.push(await uploadImage(f));
      }
      if (props.multiple) {
        props.onChange([...props.value, ...urls]);
      } else {
        props.onChange(urls[0]);
      }
    } catch (e) {
      setError(
        e instanceof ApiError
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
        className={`mt-2 grid w-full place-items-center rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
          dragOver
            ? "border-accent bg-accent/5"
            : "border-edge hover:border-accent/60"
        }`}
      >
        {busy ? (
          <span className="text-muted">Uploading…</span>
        ) : (
          <span className="text-muted">
            <span className="font-semibold text-accent">
              {!props.multiple && singleUrl ? "Replace image" : "Drop an image"}
            </span>{" "}
            or click to choose{props.multiple ? " (add more)" : ""}
          </span>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple={props.multiple}
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {error && <p className="mt-2 text-sm text-pop">{error}</p>}
    </div>
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
