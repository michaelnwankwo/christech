// tests/toast-store.test.ts — the store the toast UI is built on. The SAME
// module Toaster/AddToCartButton import; no reimplementation here.
import { beforeEach, describe, expect, it } from "vitest";
import { useToastStore } from "@/stores/toast-store";

describe("toast-store", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it("push assigns an id and defaults the tone", () => {
    useToastStore.getState().push({ title: "Added to cart", body: "DS-2CD2020G2" });
    const toast = useToastStore.getState().toasts[0];
    if (!toast) throw new Error("push() produced no toast");
    expect(toast.title).toBe("Added to cart");
    expect(toast.tone).toBe("default");
    expect(toast.id).toMatch(/[a-z0-9-]+/i);
  });

  it("caps the stack at 3, evicting the oldest", () => {
    for (const n of ["a", "b", "c", "d"]) {
      useToastStore.getState().push({ title: `t${n}` });
    }
    const titles = useToastStore.getState().toasts.map((t) => t.title);
    expect(titles).toEqual(["tb", "tc", "td"]);
  });

  it("dismiss removes exactly one", () => {
    useToastStore.getState().push({ title: "keep" });
    useToastStore.getState().push({ title: "drop", tone: "warn" });
    const drop = useToastStore.getState().toasts.find((t) => t.title === "drop")!;
    useToastStore.getState().dismiss(drop.id);
    expect(useToastStore.getState().toasts.map((t) => t.title)).toEqual(["keep"]);
  });

  it("cart action rides as data, never a closure", () => {
    useToastStore.getState().push({ title: "x", action: { label: "View cart", run: "open-cart" } });
    expect(useToastStore.getState().toasts[0]!.action).toEqual({ label: "View cart", run: "open-cart" });
  });
});
