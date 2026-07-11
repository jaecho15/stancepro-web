"use client";

import { useCallback, useEffect, useState } from "react";

// "My resorts" — the user's saved resorts for the forecast landing. Stored in
// localStorage (the app keeps its monitored list device-local too, so there
// is no backend list to sync with yet). Cross-component sync via a custom
// event so the landing list updates when a resort page toggles a save.

export interface MyResort {
  id: string;
  name: string;
  country: string;
}

const KEY = "sp-my-resorts";
const EVENT = "sp-my-resorts-changed";

function read(): MyResort[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(list: MyResort[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // storage full/blocked — saving is best-effort
  }
}

export function useMyResorts() {
  const [resorts, setResorts] = useState<MyResort[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setResorts(read());
    sync();
    setReady(true);
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = useCallback((resort: MyResort) => {
    const list = read();
    const next = list.some((r) => r.id === resort.id)
      ? list.filter((r) => r.id !== resort.id)
      : [...list, resort];
    write(next);
  }, []);

  const isSaved = useCallback(
    (id: string) => resorts.some((r) => r.id === id),
    [resorts]
  );

  return { resorts, ready, toggle, isSaved };
}
