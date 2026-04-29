export interface TokenValidation {
  ok: boolean;
  cleaned: string;
  error?: string;
  warning?: string;
}

/**
 * Valida e normaliza um Page Access Token da Meta.
 * Regras:
 * - Remove espaços, quebras de linha, tabs, aspas e crases.
 * - Apenas caracteres [A-Za-z0-9_-].
 * - Comprimento mínimo de 100 caracteres (long-lived tokens têm ~180+).
 * - Recomenda prefixo "EAA" (warning, não bloqueia).
 */
export function validateInstagramToken(raw: string): TokenValidation {
  const cleaned = (raw || "")
    .replace(/[\s"'`]+/g, "")
    .trim();

  if (!cleaned) {
    return { ok: false, cleaned, error: "Token vazio. Cole o Page Access Token do Graph API Explorer." };
  }

  if (!/^[A-Za-z0-9_-]+$/.test(cleaned)) {
    return {
      ok: false,
      cleaned,
      error: "Token contém caracteres inválidos. Use apenas letras, números, '_' e '-' (sem espaços ou aspas).",
    };
  }

  if (cleaned.length < 100) {
    return {
      ok: false,
      cleaned,
      error: `Token muito curto (${cleaned.length} caracteres). Page Access Tokens de longa duração têm ~180+ caracteres. Verifique se foi copiado por completo.`,
    };
  }

  if (!cleaned.startsWith("EAA")) {
    return {
      ok: true,
      cleaned,
      warning: "Token não começa com 'EAA' (padrão Meta). Verifique se é realmente um Page Access Token.",
    };
  }

  return { ok: true, cleaned };
}

export const REQUIRED_PERMISSIONS = [
  "instagram_basic",
  "instagram_manage_messages",
  "pages_manage_metadata",
  "pages_show_list",
] as const;

export const OPTIONAL_PERMISSIONS = ["pages_messaging"] as const;
