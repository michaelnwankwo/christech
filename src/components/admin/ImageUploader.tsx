"use client";

// src/components/admin/ImageUploader.tsx — drag-and-drop / picker uploads
// straight to the public product-images bucket (0009 policies: folder must be
// products/, size/type gates here mirror src/lib/supabase/storage.ts). The
// hidden JSON field carries the final https URL array into the server action.
// Object paths never come from user text — generated via objectPathForUpload.

import { useCallback, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import {
  PRODUCT_IMAGE_BUCKET,
  PRODUCT_IMAGE_EXTENSIONS,
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_MAX_COUNT,
  objectPathForUpload,
  publicUrlForProductImage,
} from "@/lib/supabase/storage";

type Entry = { url: string; path: string };

export function ImageUploader({
  name,
  defaultValue,
  id,
}: {
  name: string;
  defaultValue: string[];
  id?: string;
}) {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const [entries, setEntries] = useState<Entry[]>(
    defaultValue.map((url) => ({
      url,
      path: url.includes(`/public/${PRODUCT_IMAGE_BUCKET}/`)
        ? url.split(`/public/${PRODUCT_IMAGE_BUCKET}/`)[1] ?? ""
        : "",
    }))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = useCallback(
    (next: Entry[]) => {
      setEntries(next);
      const field = document.getElementById(`${id ?? name}-json`) as HTMLInputElement | null;
      if (field) field.value = JSON.stringify(next.map((e) => e.url));
    },
    [id, name]
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!configured) return;
      const list = Array.from(files);
      setError(null);
      setBusy(true);
      const supabase = createBrowserSupabaseClient();
      const next = [...entries];

      for (const file of list) {
        if (next.length >= PRODUCT_IMAGE_MAX_COUNT) {
          setError(`Max ${PRODUCT_IMAGE_MAX_COUNT} images per product.`);
          break;
        }
        const path = objectPathForUpload(file.name);
        if (!path) {
          setError(`"${file.name}": only ${PRODUCT_IMAGE_EXTENSIONS.join(", ")} files.`);
          continue;
        }
        if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
          setError(`"${file.name}": larger than 4 MB.`);
          continue;
        }
        try {
          const { error: upErr } = await supabase.storage
            .from(PRODUCT_IMAGE_BUCKET)
            .upload(path, file, { contentType: file.type || undefined, upsert: false });
          if (upErr) {
            setError(`Upload failed for "${file.name}" (${upErr.message === "The resource already exists" ? "duplicate name, try again" : "check staff session"}).`);
            continue;
          }
          next.push({ url: publicUrlForProductImage(path), path });
          commit(next);
        } catch {
          setError(`Upload failed for "${file.name}".`);
        }
      }
      setBusy(false);
    },
    [configured, entries, commit]
  );

  const remove = async (index: number) => {
    const victim = entries[index];
    if (!victim) return;
    const next = entries.filter((_, i) => i !== index);
    commit(next);
    if (victim.path && configured) {
      // Best effort — leaving a stray object is harmless; the product row is
      // the source of truth for what the storefront references.
      const supabase = createBrowserSupabaseClient();
      await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([victim.path]).catch(() => undefined);
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= entries.length) return;
    const a = entries[index];
    const b = entries[target];
    if (!a || !b) return;
    const next = [...entries];
    next[index] = b;
    next[target] = a;
    commit(next);
  };

  if (!configured) {
    return (
      <p className="muted" style={{ fontSize: ".85rem" }}>
        Image upload is unavailable without a configured Supabase project.
        You can still paste full https:// image URLs below.
      </p>
    );
  }

  return (
    <div style={{ display: "grid", gap: ".5rem" }}>
      <input type="hidden" id={`${id ?? name}-json`} name={name} defaultValue={JSON.stringify(defaultValue)} />

      <div
        role="button"
        tabIndex={0}
        aria-label="Upload product images"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void handleFiles(e.dataTransfer.files); }}
        style={{
          border: `2px dashed ${dragOver ? "var(--color-accent, #0a7)" : "var(--border-subtle, #bbb)"}`,
          borderRadius: 10, padding: "1rem", textAlign: "center", cursor: "pointer",
          fontSize: ".85rem", color: "inherit",
        }}
      >
        {busy ? "Uploading…" : "Drop .jpg / .png / .webp here, or click to choose (≤ 4 MB each)"}
        <input
          ref={inputRef}
          id={id}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={(e) => e.target.files && void handleFiles(e.target.files)}
        />
      </div>

      {error ? <p className="banner banner--error" role="alert" style={{ fontSize: ".82rem" }}>{error}</p> : null}

      {entries.length > 0 ? (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: ".5rem" }}>
          {entries.map((e, i) => (
            <li key={`${e.url}-${i}`} style={{ position: "relative", border: "1px solid var(--border-subtle, #ddd)", borderRadius: 8, overflow: "hidden" }}>
              {/* Plain <img>: admin previews must not depend on next/image remotePatterns. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={e.url} alt="" style={{ width: "100%", height: 90, objectFit: "cover", display: "block" }} />
              <div style={{ display: "flex", justifyContent: "space-between", padding: ".2rem .3rem", fontSize: ".72rem" }}>
                <span aria-hidden="true">{i === 0 ? "cover" : `#${i + 1}`}</span>
                <span>
                  <button type="button" aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>{" "}
                  <button type="button" aria-label="Move later" disabled={i === entries.length - 1} onClick={() => move(i, 1)}>↓</button>{" "}
                  <button type="button" aria-label="Remove image" onClick={() => void remove(i)}>✕</button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
