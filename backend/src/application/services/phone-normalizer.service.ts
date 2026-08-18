import googleLibPhoneNumber from "google-libphonenumber";
import { HttpError } from "../../shared/errors/http-error.js";

const { PhoneNumberFormat, PhoneNumberUtil } = googleLibPhoneNumber;

export interface NormalizedPhone {
  original: string;
  e164: string;
  digits: string;
  regionCode?: string;
}

export type PhoneNormalizationResult =
  | { ok: true; value: NormalizedPhone }
  | { ok: false; error: string };

export class PhoneNormalizerService {
  private readonly phoneUtil = PhoneNumberUtil.getInstance();

  tryNormalize(rawValue: string, defaultRegion: string): PhoneNormalizationResult {
    const original = String(rawValue ?? "");
    const raw = original.trim();
    const region = String(defaultRegion || "").trim().toUpperCase();

    if (!raw) return { ok: false, error: "Teléfono vacío." };
    if (!region || region.length !== 2) return { ok: false, error: `Región inválida: ${defaultRegion}` };

    const digits = raw.replace(/\D/g, "");
    if (!digits) return { ok: false, error: `Número telefónico inválido: ${original}` };

    const candidates: string[] = [];
    const add = (value: string) => {
      const candidate = value.trim();
      if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
    };

    add(raw);

    let countryCode = 0;
    try {
      countryCode = this.phoneUtil.getCountryCodeForRegion(region);
    } catch {
      countryCode = 0;
    }

    const countryCodeText = countryCode > 0 ? String(countryCode) : "";

    // +0986...: el + fue usado como decoración; probamos como número nacional.
    if (raw.startsWith("+") && countryCodeText && !digits.startsWith(countryCodeText)) {
      add(digits);
      if (!digits.startsWith("0")) add(`0${digits}`);
    }

    if (countryCodeText && digits.startsWith(countryCodeText)) {
      const nationalPart = digits.slice(countryCodeText.length);

      // Ej.: 5950986... -> +595986...
      if (nationalPart.startsWith("0")) {
        add(`+${countryCodeText}${nationalPart.replace(/^0+/, "")}`);
      }

      // Ej.: 595986... -> +595986...
      add(`+${digits}`);
    } else {
      // Ej.: 0986... o 986... se interpretan usando la región elegida.
      add(digits);
    }

    for (const candidate of candidates) {
      try {
        const parsed = this.phoneUtil.parseAndKeepRawInput(candidate, region);
        if (!this.phoneUtil.isValidNumber(parsed)) continue;
        const e164 = this.phoneUtil.format(parsed, PhoneNumberFormat.E164);
        return {
          ok: true,
          value: {
            original,
            e164,
            digits: e164.replace(/\D/g, ""),
            regionCode: this.phoneUtil.getRegionCodeForNumber(parsed) ?? undefined,
          },
        };
      } catch {
        // Probar el siguiente candidato.
      }
    }

    return { ok: false, error: `Número telefónico inválido: ${original}` };
  }

  normalize(rawValue: string, defaultRegion: string): NormalizedPhone {
    const result = this.tryNormalize(rawValue, defaultRegion);
    if (!result.ok) throw new HttpError(400, result.error);
    return result.value;
  }
}
