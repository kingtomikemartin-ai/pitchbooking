import { QueryClient } from "@tanstack/react-query";

// Singleton QueryClient used across the whole app.
// Also passed explicitly into hooks to avoid "No QueryClient set" crashes
// if the React context ever gets duplicated by the bundler.
export const queryClient = new QueryClient();
