const resizeObserverMessages = [
  "ResizeObserver loop limit exceeded",
  "ResizeObserver loop completed with undelivered notifications",
] as const;

function getMessage(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (
    typeof ErrorEvent !== "undefined" &&
    value instanceof ErrorEvent
  ) {
    return value.message;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof (value as { message?: unknown }).message === "string"
  ) {
    return (value as { message: string }).message;
  }

  return "";
}

function isResizeObserverNoise(value: unknown): boolean {
  const message = getMessage(value);

  return resizeObserverMessages.some((expectedMessage) =>
    message.includes(expectedMessage),
  );
}

window.addEventListener(
  "error",
  (event: ErrorEvent) => {
    if (
      !isResizeObserverNoise(event.message) &&
      !isResizeObserverNoise(event.error)
    ) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
  },
  true,
);

window.addEventListener(
  "unhandledrejection",
  (event: PromiseRejectionEvent) => {
    if (!isResizeObserverNoise(event.reason)) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
  },
  true,
);