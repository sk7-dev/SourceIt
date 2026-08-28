import { ClerkProvider } from "@clerk/clerk-react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { Toaster } from "./components/ui/sonner";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!clerkPublishableKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY — copy .env.local.example to .env.local and fill it in");
}

function App() {
  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <RouterProvider router={router} />
      <Toaster />
    </ClerkProvider>
  );
}

export default App;
