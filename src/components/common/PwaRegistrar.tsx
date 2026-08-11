"use client";

import { useEffect } from "react";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function PwaRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    const register = () => {
      const scope = `${BASE_PATH}/` || "/";
      navigator.serviceWorker
        .register(`${BASE_PATH}/sw.js`, { scope, updateViaCache: "none" })
        .catch((error: unknown) => {
          // PWA 是增强能力，注册失败不应阻塞游戏启动。
          console.warn("Service Worker 注册失败：", error);
        });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
