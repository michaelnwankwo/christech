"use client";

import Link from "next/link";
import { useState } from "react";

// Small row-action cluster for the admin catalog table. Server actions arrive
// as props (stable, framework-serialized); both are re-guarded server-side.

export function ProductRowActions({
  id,
  isActive,
  toggleAction,
  deleteAction,
}: {
  id: string;
  isActive: boolean;
  toggleAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  const [armDelete, setArmDelete] = useState(false);

  return (
    <span style={{ display: "inline-flex", gap: ".5rem", alignItems: "center" }}>
      <Link href={`/admin/products/${id}`} style={{ fontSize: ".85rem" }}>Edit</Link>
      <form action={toggleAction} style={{ display: "inline" }}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="next" value={isActive ? "false" : "true"} />
        <button type="submit" className="btn btn--ghost" style={{ fontSize: ".8rem", padding: ".15rem .5rem" }}>
          {isActive ? "Hide" : "Unhide"}
        </button>
      </form>
      {armDelete ? (
        // Native form-action submission only — no manual call (a previous
        // draft double-fired: action prop + onSubmit both invoking the action).
        <form action={deleteAction} style={{ display: "inline" }}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="confirm" value="DELETE" />
          <button type="submit" style={{ fontSize: ".8rem", color: "#b00020" }}>
            Confirm delete
          </button>{" "}
          <button type="button" style={{ fontSize: ".8rem" }} onClick={() => setArmDelete(false)}>Cancel</button>
        </form>
      ) : (
        <button type="button" style={{ fontSize: ".8rem" }} onClick={() => setArmDelete(true)}>
          Delete…
        </button>
      )}
    </span>
  );
}
