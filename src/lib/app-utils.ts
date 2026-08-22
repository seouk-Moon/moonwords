export const uid = () => crypto.randomUUID();

export const shuffle = <T,>(items: T[]) => {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  if (shuffled.length > 1 && shuffled.every((item, index) => item === items[index])) {
    shuffled.push(shuffled.shift()!);
  }
  return shuffled;
};

export const cleanSelection = (value: string) =>
  value.replace(/[“”‘’]/g, "'").replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "").replace(/\s+/g, " ").trim();

const lexicalForms = (value: string) => {
  const normalized = cleanSelection(value).toLowerCase().replace(/'s$/, "");
  const forms = new Set([normalized]);
  if (!normalized.includes(" ")) {
    if (normalized.endsWith("ies") && normalized.length > 4) forms.add(`${normalized.slice(0, -3)}y`);
    if (normalized.endsWith("ing") && normalized.length > 5) {
      const stem = normalized.slice(0, -3);
      forms.add(stem); forms.add(`${stem}e`);
      if (stem.length > 2 && stem.at(-1) === stem.at(-2)) forms.add(stem.slice(0, -1));
    }
    if (normalized.endsWith("ed") && normalized.length > 4) {
      const stem = normalized.slice(0, -2);
      forms.add(stem); forms.add(`${stem}e`);
      if (stem.length > 2 && stem.at(-1) === stem.at(-2)) forms.add(stem.slice(0, -1));
    }
    if (normalized.endsWith("es") && normalized.length > 4) forms.add(normalized.slice(0, -2));
    if (normalized.endsWith("s") && normalized.length > 3) forms.add(normalized.slice(0, -1));
  }
  return forms;
};

export const sameLexeme = (left: string, right: string) => {
  const rightForms = lexicalForms(right);
  return [...lexicalForms(left)].some((form) => rightForms.has(form));
};

export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
