"use client";

import { useEffect } from "react";

// Wires the world hero map to the region cards: hovering a card emphasises
// its zone and pin; clicking a pin scrolls to the card. Pure progressive
// enhancement over server-rendered DOM — no geometry ships to the client.
export function OutlookHeroSync() {
  useEffect(() => {
    const zones = (id: string) =>
      document.querySelectorAll<SVGPathElement>(`[data-zone="${CSS.escape(id)}"] path`);
    const pin = (id: string) =>
      document.querySelector<SVGGElement>(`[data-pin="${CSS.escape(id)}"]`);

    const emphasise = (id: string, on: boolean) => {
      zones(id).forEach((path) => {
        path.setAttribute("fill-opacity", on ? "0.55" : "0.28");
        path.setAttribute("stroke-width", on ? "1.4" : "0.6");
      });
      pin(id)
        ?.querySelector("circle")
        ?.setAttribute("r", on ? "6" : "4.6");
    };

    const cleanups: (() => void)[] = [];

    document
      .querySelectorAll<HTMLElement>("[data-outlook-card]")
      .forEach((card) => {
        const id = card.dataset.outlookCard!;
        const enter = () => emphasise(id, true);
        const leave = () => emphasise(id, false);
        card.addEventListener("mouseenter", enter);
        card.addEventListener("mouseleave", leave);
        cleanups.push(() => {
          card.removeEventListener("mouseenter", enter);
          card.removeEventListener("mouseleave", leave);
        });
      });

    document.querySelectorAll<SVGGElement>("[data-pin]").forEach((pinEl) => {
      const id = pinEl.dataset.pin!;
      const click = () => {
        const card = document.querySelector<HTMLElement>(
          `[data-outlook-card="${CSS.escape(id)}"]`
        );
        card?.scrollIntoView({ behavior: "smooth", block: "center" });
        emphasise(id, true);
        setTimeout(() => emphasise(id, false), 1800);
      };
      pinEl.addEventListener("click", click);
      cleanups.push(() => pinEl.removeEventListener("click", click));
    });

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}
