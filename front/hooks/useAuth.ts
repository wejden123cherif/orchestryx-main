"use client";

import { useContext } from "react";
import { AuthContext } from "@/context/AuthContext";

// Convenience hook to consume auth context with a strict runtime guard.
export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
};
