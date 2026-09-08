export interface CampaignMessagePayload {
  text: string;
  caption?: string;
}

export interface CampaignContactInput {
  name?: string;
  phone: string;
  variables?: Record<string, string>;
}

export function parseSpintax(text: string): string {
  if (!text || !text.includes("{") || !text.includes("|")) return text;
  let result = text;
  let iterations = 0;
  while (result.includes("{") && result.includes("|") && iterations < 15) {
    iterations++;
    const prev = result;
    result = result.replace(/\{([^{}]+)\}/g, (match, choicesStr: string) => {
      if (!choicesStr.includes("|")) return match;
      const choices = choicesStr.split("|").map((c) => c.trim());
      const randomIndex = Math.floor(Math.random() * choices.length);
      return choices[randomIndex] ?? "";
    });
    if (result === prev) break;
  }
  return result;
}

export function renderCampaignTemplate(
  template: CampaignMessagePayload,
  variables: Record<string, string>,
): CampaignMessagePayload {
  const render = (value?: string): string | undefined => {
    if (value === undefined) return undefined;
    const withVariables = value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => variables[key] ?? "");
    return parseSpintax(withVariables);
  };
  return {
    text: render(template.text) ?? "",
    caption: render(template.caption),
  };
}

