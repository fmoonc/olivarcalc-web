/**
 * Maps a `related_tool` from the API to the public route of that calculator.
 *
 * Kept in one place because the API stores the tool key
 * (`yield_converter`, `cost_per_hectare`, ...) while the site uses SEO-friendly
 * Spanish slugs (spec §10.2, §11: internal linking both ways).
 */
const toolPaths: Record<string, string> = {
  settlement: 'liquidacion-aceituna',
  yield_converter: 'rendimiento-aceituna',
  cost_per_hectare: 'coste-olivar-hectarea',
  harvest_crew: 'coste-cuadrilla-recogida',
};

export function toolPath(toolKey: string): string {
  return toolPaths[toolKey] ?? toolKey;
}
