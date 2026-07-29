type SlugLookup = (slug: string) => Promise<{ id: string } | undefined>;

export async function makeUniqueSlug(
  base: string,
  lookup: SlugLookup,
  currentId?: string,
): Promise<string> {
  const clean = (base || "").trim() || "item";
  let candidate = clean;
  let n = 1;

  while (true) {
    const found = await lookup(candidate);
    if (!found || found.id === currentId) return candidate;
    n += 1;
    candidate = `${clean}-${n}`;
  }
}
