import { useEffect, useId, useMemo, useState } from "react";
import { Check, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  findBrazilianMunicipality,
  searchBrazilianMunicipalities,
  type BrazilianMunicipality,
} from "@shared/brazilian-municipalities";
import { cn } from "@/lib/utils";

export type BrazilianCityValue = {
  city: string;
  state: string;
};

type BrazilianCityAutocompleteProps = {
  value: BrazilianCityValue;
  onChange: (value: BrazilianCityValue) => void;
  onValidityChange?: (valid: boolean) => void;
  required?: boolean;
  className?: string;
};

export function BrazilianCityAutocomplete({
  value,
  onChange,
  onValidityChange,
  required = false,
  className,
}: BrazilianCityAutocompleteProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const results = useMemo(
    () => value.city.trim().length >= 2 ? searchBrazilianMunicipalities(value.city, 8) : [],
    [value.city],
  );
  const exactMunicipality = useMemo(
    () => findBrazilianMunicipality(value.city, value.state || undefined),
    [value.city, value.state],
  );
  const isValid = exactMunicipality !== null || (!required && !value.city.trim());
  const showResults = open && value.city.trim().length >= 2;

  useEffect(() => {
    onValidityChange?.(isValid);
  }, [isValid, onValidityChange]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [value.city]);

  const selectMunicipality = (municipality: BrazilianMunicipality) => {
    onChange({ city: municipality.name, state: municipality.uf });
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Input
          id="sign-city"
          value={value.city}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showResults}
          aria-controls={listId}
          aria-activedescendant={showResults && results[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          className={cn("pr-9", className)}
          placeholder="Comece a digitar a cidade"
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 100)}
          onChange={(event) => {
            onChange({ city: event.target.value, state: "" });
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              return;
            }
            if (!showResults || results.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((current) => Math.min(current + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) => current <= 0 ? results.length - 1 : current - 1);
            } else if (event.key === "Enter") {
              event.preventDefault();
              selectMunicipality(results[Math.max(activeIndex, 0)]);
            }
          }}
          data-testid="input-city"
        />
        <MapPin className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      </div>

      {showResults && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg"
        >
          {results.length > 0 ? results.map((municipality, index) => (
            <button
              id={`${listId}-${index}`}
              key={`${municipality.name}-${municipality.uf}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={cn(
                "flex min-h-10 w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-slate-800",
                index === activeIndex ? "bg-slate-100" : "hover:bg-slate-50",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectMunicipality(municipality)}
            >
              <span>{municipality.name} - {municipality.uf}</span>
              {value.city === municipality.name && value.state === municipality.uf ? (
                <Check className="h-4 w-4 text-teal-600" aria-hidden="true" />
              ) : null}
            </button>
          )) : (
            <p className="px-3 py-3 text-sm text-slate-500">Nenhuma cidade encontrada</p>
          )}
        </div>
      )}
    </div>
  );
}
