import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createHashHistory, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { QueryProvider } from "./providers/query-provider";
import { SystemEventListener } from "./components/system-event-listener";
import "./index.css";
import "streamdown/styles.css";

const hashHistory = createHashHistory();

const router = createRouter({
  routeTree,
  history: hashHistory,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

document.body.classList.add("theme");
const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found.");
}

rootElement.classList.add("theme");

createRoot(rootElement).render(
  <StrictMode>
    <QueryProvider>
      <SystemEventListener />
      <RouterProvider router={router} />
    </QueryProvider>
  </StrictMode>,
);
