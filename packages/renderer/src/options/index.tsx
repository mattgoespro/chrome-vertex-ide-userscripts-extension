import { ErrorBoundary } from "@/shared/components/error-boundary/ErrorBoundary";
import { ToastProvider } from "@/shared/components/toast/ToastProvider";
import { CommandRegistryProvider } from "@/shared/contexts/command-registry.context";
import { store } from "@/shared/store/store";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary as ReactErrorBoundary } from "react-error-boundary";
import { Provider } from "react-redux";
import "../assets/styles/tailwind.css";
import { UiBootstrap } from "./invert-ide/components/ui-bootstrap/UiBootstrap";
import { InvertIde } from "./invert-ide/InvertIde";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ReactErrorBoundary FallbackComponent={ErrorBoundary}>
      <Provider store={store}>
        <CommandRegistryProvider>
          <ToastProvider>
            <UiBootstrap>
              <InvertIde />
            </UiBootstrap>
          </ToastProvider>
        </CommandRegistryProvider>
      </Provider>
    </ReactErrorBoundary>
  </StrictMode>
);
