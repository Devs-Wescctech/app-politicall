# Public Petition Form UX

## Goal

Improve the public petition signature flow with reliable Brazilian phone input, municipality autocomplete, and clearer social actions without changing the existing petition data model.

## Phone Input

- Format Brazilian numbers while typing as `(DD) 99999-9999` or `(DD) 9999-9999`.
- Accept pasted values containing `+55`, whitespace, punctuation, or only digits.
- Store and submit the normalized national number with DDD, containing 10 or 11 digits.
- Reject invalid DDDs, repeated-digit values, fixed-line numbers with an invalid first subscriber digit, and mobile numbers without the ninth digit.
- Show an inline error after the field has a complete but invalid value and block submission when an optional phone was supplied but is invalid.
- Revalidate and normalize on the server so direct API calls cannot bypass the rule.
- This is structural validation only; it does not claim that the telephone line exists or belongs to the signer.

## Municipality Autocomplete

- Bundle the complete official Brazilian municipality list with the application so the public form does not depend on an external service at runtime.
- Search city names without case or accent sensitivity.
- Show options as `City - UF` while the signer types.
- Selecting an option fills both the city and state fields.
- When the petition collects city but does not display state, the selected UF is still submitted when location collection allows it, preserving consistent location data.
- Limit the visible result list for usability while searching the entire dataset.
- Require selection from the municipality list when location is required; optional free text is not persisted as a valid municipality.

## Sharing And Contact Actions

- Keep petition sharing only on the initial public petition screen.
- Remove WhatsApp, Facebook, X, Telegram, and copy-link sharing actions from the post-signature confirmation.
- Keep the post-signature section `Fale com o proponente da petição` for the petition owner's configured contact links.
- Increase initial sharing controls to a stable touch target of at least 44 by 44 pixels.
- Use recognizable brand colors: WhatsApp green, Facebook blue, X black, Telegram blue, and a neutral link color.
- Preserve accessible names, focus states, tooltips, and safe external-window behavior.

## Data Flow

1. The signer types a phone; the client formats it and validates its Brazilian structure.
2. The signer searches for a municipality and selects a `City - UF` result; city and state update together.
3. The client submits normalized values.
4. The public signature endpoint repeats phone and location validation before persistence.
5. After success, the dialog offers only configured proponent contact actions; sharing remains available on the petition page behind the dialog.

## Error Handling

- Invalid phone input receives a field-specific Portuguese message and submission remains blocked.
- An unselected or unknown municipality receives a field-specific message when location is required.
- Server validation returns the same stable field errors for malformed direct requests.
- Clipboard failure continues to be announced on the initial sharing section.

## Verification

- Unit tests cover phone formatting, normalization, accepted fixed/mobile numbers, invalid DDDs, repeated digits, and malformed values.
- Unit tests cover accent-insensitive municipality lookup and automatic UF selection.
- Route/service tests prove server-side rejection and normalization.
- Component tests prove autocomplete behavior, submission payload, removal of success-dialog sharing, and initial brand-colored controls.
- Type checking, focused tests, full tests, production build, and browser checks run before publication.

## Non-goals

- Verifying telephone ownership or carrier activation.
- Adding an external geocoding or IBGE runtime dependency.
- Changing petition administration fields or existing stored signatures.
