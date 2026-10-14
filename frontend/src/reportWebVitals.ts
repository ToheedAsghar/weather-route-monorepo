const reportWebVitals = (onPerfEntry?: (entry: unknown) => void): void => {
  if (onPerfEntry && onPerfEntry instanceof Function) {
    import("web-vitals")
      .then(({ onCLS, onFCP, onLCP, onTTFB }) => {
        onCLS?.(onPerfEntry);
        onFCP?.(onPerfEntry);
        onLCP?.(onPerfEntry);
        onTTFB?.(onPerfEntry);
      })
      .catch(() => {
        // Optional web-vitals reporting
      });
  }
};

export default reportWebVitals;
