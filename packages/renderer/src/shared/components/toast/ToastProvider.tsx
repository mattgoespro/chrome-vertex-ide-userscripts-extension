import { createContext, useCallback, useContext, useState } from "react";
import { uuid } from "@shared/utils";
import { ToastContainer } from "./ToastContainer";
import type { ToastItem, ToastOptions } from "./model";

const MAX_TOASTS = 5;
const DEFAULT_DURATION = 5000;

type ToastContextValue = {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((options: ToastOptions): string => {
    const id = uuid();
    const item: ToastItem = {
      id,
      variant: options.variant,
      message: options.message,
      duration: options.duration ?? DEFAULT_DURATION,
      dismissible: options.dismissible ?? true,
    };

    setToasts((prev) => {
      const next = [...prev, item];
      // Drop the oldest toasts if we exceed the cap
      return next.length > MAX_TOASTS ? next.slice(-MAX_TOASTS) : next;
    });

    return id;
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/**
 * Returns the toast API for showing and dismissing alert toasts.
 * Must be used within a {@link ToastProvider}.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error(
      "The `useToast` hook can only be used in a component tree wrapped by `<ToastProvider>`."
    );
  }

  return context;
}
