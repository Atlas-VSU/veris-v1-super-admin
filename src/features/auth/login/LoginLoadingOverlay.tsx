import { useState, useEffect } from "react";
import { LoadingMessage, LOADING_MESSAGES } from "../types";
import { LoadingScreen } from "@/components/ui/loading-screen";

interface LoginLoadingOverlayProps {
  message?: LoadingMessage;
}

export function LoginLoadingOverlay({
  message,
}: LoginLoadingOverlayProps) {
  const [currentMessage, setCurrentMessage] = useState<LoadingMessage>(
    message || LOADING_MESSAGES[0]
  );

  useEffect(() => {
    if (message) return; // Don't rotate if a specific message is provided

    let currentIndex = 0;
    const interval = setInterval(() => {
      currentIndex = (currentIndex + 1) % LOADING_MESSAGES.length;
      setCurrentMessage(LOADING_MESSAGES[currentIndex]);
    }, 2500); // Rotate every 2.5 seconds

    return () => clearInterval(interval);
  }, [message]);

  return (
    <LoadingScreen 
      message={currentMessage} 
      showDelayMessage={false} 
      className="z-[9999]" 
    />
  );
}