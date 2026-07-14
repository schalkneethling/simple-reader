function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function htmlFragmentToText(value: string): string {
  const template = document.createElement("template");
  template.innerHTML = value;
  return template.content.textContent ?? value;
}

export function htmlSummaryToText(value: string): string {
  let current = value;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const next = htmlFragmentToText(current);
    if (next === current) break;
    current = next;
  }
  return normalizeWhitespace(current);
}
