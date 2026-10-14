import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, MapPin, X } from "lucide-react";
import { searchLocations } from "@/repositories/api/route-service";
import { GEOCODING_CONFIG } from "@/constants";
import type { GeoLocation, LocationSuggestion } from "@/common/types";

interface LocationAutocompleteProps {
  label: string;
  icon: React.ReactNode;
  placeholder?: string;
  value?: GeoLocation;
  onSelect: (location: GeoLocation | undefined) => void;
  required?: boolean;
  disabled?: boolean;
  onOffline?: (error: Error) => void;
}

export function LocationAutocomplete({
  label,
  icon,
  placeholder,
  value,
  onSelect,
  required = true,
  disabled = false,
  onOffline,
}: LocationAutocompleteProps): React.ReactElement {
  const [query, setQuery] = useState(value?.address ?? "");
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<number | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | undefined>(undefined);

  // Sync external value state if changed from outside
  useEffect(() => {
    if (value) {
      setQuery(value.address);
    } else {
      setQuery("");
    }
  }, [value]);

  // Handle typing with 300ms debounce, >= 3 chars, and AbortController cancellation
  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      const text = event.target.value;
      setQuery(text);
      setSelectedIndex(-1);

      // If user erased text, immediately clear location state
      if (!text.trim()) {
        onSelect(undefined);
      }

      // 1. Clear previous debounce timer
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }

      // 2. Cancel previous inflight network request using AbortController
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = undefined;
      }

      const trimmed = text.trim();

      // Start only after minimum configured characters
      if (trimmed.length < GEOCODING_CONFIG.MIN_QUERY_LENGTH) {
        setSuggestions([]);
        setIsOpen(false);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      // Debounced search trigger
      debounceTimerRef.current = window.setTimeout(async () => {
        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
          const results = await searchLocations(trimmed, controller.signal);
          setSuggestions(results);
          setIsOpen(results.length > 0);
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            return;
          }
          setSuggestions([]);
          setIsOpen(false);
          if (err instanceof Error) {
            onOffline?.(err);
          }
        } finally {
          setIsLoading(false);
        }
      }, GEOCODING_CONFIG.DEBOUNCE_MS);
    },
    [disabled, onOffline, onSelect]
  );

  const handleSelectSuggestion = useCallback(
    (item: LocationSuggestion) => {
      setQuery(item.place_name);
      setSuggestions([]);
      setIsOpen(false);
      setSelectedIndex(-1);
      onSelect({
        lat: item.lat,
        lon: item.lon,
        address: item.place_name,
      });
    },
    [onSelect]
  );

  const handleClear = useCallback(() => {
    setQuery("");
    setSuggestions([]);
    setIsOpen(false);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    onSelect(undefined);
  }, [onSelect]);

  // Keyboard navigation (Arrow keys, Enter, Escape)
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        if (isOpen && suggestions.length > 0) {
          event.preventDefault();
          const chosen = suggestions[selectedIndex >= 0 ? selectedIndex : 0];
          handleSelectSuggestion(chosen);
          return;
        }
      }

      if (!isOpen || suggestions.length === 0) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
      } else if (event.key === "Escape") {
        setIsOpen(false);
      }
    },
    [handleSelectSuggestion, isOpen, selectedIndex, suggestions]
  );

  // Auto-resolve top suggestion on blur if user typed but did not click
  const handleBlur = useCallback(() => {
    window.setTimeout(() => {
      if (!value && suggestions.length > 0 && query.trim().length >= 3) {
        handleSelectSuggestion(suggestions[0]);
      }
      setIsOpen(false);
    }, 200);
  }, [handleSelectSuggestion, query, suggestions, value]);

  // Click outside listener to dismiss dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  return (
    <div ref={containerRef} className="relative block">
      <label className="block">
        <span className="mb-1.5 block text-[10px] font-extrabold uppercase text-muted-foreground">
          {label}
        </span>
        <span
          className={`relative flex h-11 items-center gap-2 rounded-full border border-border bg-input-surface px-4 text-sm transition ${
            disabled
              ? "cursor-not-allowed opacity-60 bg-muted/30"
              : "focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10"
          }`}
        >
          <span className="text-muted-foreground [&>svg]:size-3.5">{icon}</span>
          <input
            type="text"
            disabled={disabled}
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onFocus={() => {
              if (!disabled && suggestions.length > 0) setIsOpen(true);
            }}
            placeholder={disabled ? "Routing engine offline..." : placeholder || `Enter ${label.toLowerCase()}...`}
            required={required}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed"
          />
          {isLoading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          {!isLoading && query && (
            <button
              type="button"
              onClick={handleClear}
              className="text-muted-foreground transition hover:text-foreground"
              aria-label={`Clear ${label}`}
            >
              <X className="size-3.5" />
            </button>
          )}
        </span>
      </label>

      {/* Autocomplete Suggestions Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-border bg-panel p-1.5 shadow-float backdrop-blur-xl">
          {suggestions.map((item, index) => {
            const isSelected = index === selectedIndex;
            return (
              <li
                key={item.id || `${item.lat}-${item.lon}-${index}`}
                onMouseDown={() => handleSelectSuggestion(item)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition ${
                  isSelected ? "bg-muted font-bold text-primary" : "text-foreground hover:bg-muted/70"
                }`}
              >
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold leading-snug text-foreground">
                    {item.text || item.place_name.split(",")[0]}
                  </p>
                  <p className="truncate text-[10px] font-medium text-muted-foreground">
                    {item.place_name}
                  </p>
                </div>
                {isSelected && <Check className="size-3.5 shrink-0 text-primary" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default LocationAutocomplete;
