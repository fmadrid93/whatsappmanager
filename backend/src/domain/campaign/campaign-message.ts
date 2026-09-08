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
  const spintaxRegex = /\{([^{}]+)\}/g;
  let result = text;
  while (spintaxRegex.test(result)) {
    result = result.replace(spintaxRegex, (_match, choicesStr: string) => {
      const choices = choicesStr.split("|");
      const randomIndex = Math.floor(Math.random() * choices.length);
      return choices[randomIndex] ?? "";
    });
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

