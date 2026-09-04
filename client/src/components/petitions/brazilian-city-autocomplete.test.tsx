// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BrazilianCityAutocomplete,
  type BrazilianCityValue,
} from "./brazilian-city-autocomplete";

afterEach(cleanup);

function ControlledCity({ onValidityChange = vi.fn() }: { onValidityChange?: (valid: boolean) => void }) {
  const [value, setValue] = useState<BrazilianCityValue>({ city: "", state: "" });
  return (
    <>
      <BrazilianCityAutocomplete
        value={value}
        onChange={setValue}
        onValidityChange={onValidityChange}
        required
      />
      <output data-testid="selected-location">{value.city}|{value.state}</output>
    </>
  );
}

describe("BrazilianCityAutocomplete", () => {
  it("shows accent-insensitive suggestions and fills city and UF on selection", async () => {
    const user = userEvent.setup();
    render(<ControlledCity />);

    await user.type(screen.getByTestId("input-city"), "florianop");
    await user.click(await screen.findByRole("option", { name: "Florianópolis - SC" }));

    expect(screen.getByTestId("selected-location").textContent).toBe("Florianópolis|SC");
    expect((screen.getByTestId("input-city") as HTMLInputElement).value).toBe("Florianópolis");
  });

  it("supports keyboard selection", async () => {
    const user = userEvent.setup();
    render(<ControlledCity />);

    const input = screen.getByTestId("input-city");
    await user.type(input, "curit");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(screen.getByTestId("selected-location").textContent).toBe("Curitiba|PR");
  });

  it("reports no results and invalidates a selected city when edited", async () => {
    const user = userEvent.setup();
    const onValidityChange = vi.fn();
    render(<ControlledCity onValidityChange={onValidityChange} />);

    const input = screen.getByTestId("input-city");
    await user.type(input, "florianop");
    await user.click(await screen.findByRole("option", { name: "Florianópolis - SC" }));
    expect(onValidityChange).toHaveBeenLastCalledWith(true);

    await user.type(input, "x");
    expect(screen.getByTestId("selected-location").textContent).toBe("Florianópolisx|");
    expect(onValidityChange).toHaveBeenLastCalledWith(false);

    await user.clear(input);
    await user.type(input, "zzzzmunicipio");
    expect(await screen.findByText("Nenhuma cidade encontrada")).toBeTruthy();
  });
});
