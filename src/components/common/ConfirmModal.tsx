"use client";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

interface ConfirmModalProps {
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  cancelText?: string;
  confirmText?: string;
  danger?: boolean;
}

// 通用确认弹窗：通过 createPortal 渲染到 document.body，
// 复用 globals.css 中已有的 .modal-backdrop / .modal（position: fixed 全屏居中）。
export function ConfirmModal({
  title,
  children,
  onCancel,
  onConfirm,
  cancelText = "取消",
  confirmText = "确认",
  danger = false,
}: ConfirmModalProps) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onCancel}>{cancelText}</button>
          <button className={`btn ${danger ? "danger" : "primary"}`} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
