import { ErrorBoundary } from "@/shared/components/error-boundary/ErrorBoundary";
import { ToastProvider } from "@/shared/components/toast/ToastProvider";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary as ReactErrorBoundary } from "react-error-boundary";
import { Provider } from "react-redux";
import "../assets/styles/tailwind.css";
import { Popup } from "./Popup";
import { popupStore } from "./popup-store";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ReactErrorBoundary FallbackComponent={ErrorBoundary}>
      <Provider store={popupStore}>
        <ToastProvider>
          <Popup />
        </ToastProvider>
      </Provider>
    </ReactErrorBoundary>
  </StrictMode>
);
