export interface CampaignMessagePayload {
  text: string;
  caption?: string;
}

export interface CampaignContactInput {
  name?: string;
  phone: string;
  variables?: Record<string, string>;
}

export function renderCampaignTemplate(
  template: CampaignMessagePayload,
  variables: Record<string, string>,
): CampaignMessagePayload {
  const render = (value?: string): string | undefined => {
    if (value === undefined) return undefined;
    return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => variables[key] ?? "");
  };
  return {
    text: render(template.text) ?? "",
    caption: render(template.caption),
  };
}
