/**
 * Text normalization utilities for grouping similar text responses
 * Handles Portuguese text with accents, case variations, and whitespace
 */

/**
 * Normalizes text for comparison by:
 * - Trimming whitespace
 * - Converting to lowercase
 * - Removing diacritics/accents (João -> joao)
 * - Normalizing Unicode characters
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD') // Decompose Unicode characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/\s+/g, ' '); // Normalize multiple spaces to single space
}

/**
 * Groups similar text responses and counts occurrences
 * Returns array of grouped responses with counts, sorted by frequency
 */
export interface GroupedTextResponse {
  displayText: string; // Original text (first occurrence)
  normalizedText: string; // Normalized version
  count: number;
}

export function groupTextResponses(responses: string[]): GroupedTextResponse[] {
  const groupMap = new Map<string, GroupedTextResponse>();
  
  responses.forEach(response => {
    const normalized = normalizeText(response);
    
    if (!normalized) return; // Skip empty responses
    
    const existing = groupMap.get(normalized);
    
    if (existing) {
      existing.count++;
    } else {
      groupMap.set(normalized, {
        displayText: response.trim(), // Preserve original capitalization
        normalizedText: normalized,
        count: 1
      });
    }
  });
  
  // Convert to array and sort by count (descending)
  return Array.from(groupMap.values())
    .sort((a, b) => b.count - a.count);
}
