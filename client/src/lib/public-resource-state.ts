export type PublicResourceState = "loading" | "ready" | "error";

export function getPublicResourceState({
  isLoading,
  isError,
  hasData,
}: {
  isLoading: boolean;
  isError: boolean;
  hasData: boolean;
}): PublicResourceState {
  if (isLoading) return "loading";
  if (isError || !hasData) return "error";
  return "ready";
}
