export function nextSegId(segments: { id: string }[]): string {
  return `seg_${String(segments.length + 1).padStart(2, "0")}`;
}
