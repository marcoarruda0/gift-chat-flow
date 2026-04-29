/**
 * Utilitários para CPF e telefone brasileiro:
 * - normalização (apenas dígitos)
 * - validação (CPF com dígitos verificadores; telefone 10 ou 11 dígitos com DDD válido)
 * - máscara visual durante a digitação
 */

export const apenasDigitos = (v: string): string => (v || "").replace(/\D/g, "");

/** Valida CPF (dígitos verificadores). Aceita string formatada ou só dígitos. */
export function validarCPF(value: string): boolean {
  const cpf = apenasDigitos(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // todos dígitos iguais

  const calcDigito = (base: string, pesoInicial: number): number => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += parseInt(base[i], 10) * (pesoInicial - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const d1 = calcDigito(cpf.slice(0, 9), 10);
  const d2 = calcDigito(cpf.slice(0, 10), 11);
  return d1 === parseInt(cpf[9], 10) && d2 === parseInt(cpf[10], 10);
}

/** Aplica máscara `000.000.000-00` progressivamente. */
export function mascararCPF(value: string): string {
  const d = apenasDigitos(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** DDDs válidos no Brasil (Anatel). */
const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * Valida telefone BR: aceita 10 (fixo) ou 11 (celular) dígitos.
 * - 11 dígitos: o 3º (após DDD) deve ser 9.
 * - DDD precisa ser válido.
 */
export function validarTelefoneBR(value: string): boolean {
  const tel = apenasDigitos(value);
  if (tel.length !== 10 && tel.length !== 11) return false;
  const ddd = parseInt(tel.slice(0, 2), 10);
  if (!DDDS_VALIDOS.has(ddd)) return false;
  if (tel.length === 11 && tel[2] !== "9") return false;
  return true;
}

/** Aplica máscara `(00) 0000-0000` ou `(00) 00000-0000`. */
export function mascararTelefoneBR(value: string): string {
  const d = apenasDigitos(value).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Heurística: o termo digitado parece um CPF válido (11 dígitos + DV). */
export const ehProvavelCPF = (value: string): boolean =>
  apenasDigitos(value).length === 11 && validarCPF(value);

/**
 * Normaliza telefone BR para a forma canônica (sem DDI), 10 ou 11 dígitos.
 * - Remove DDI 55 quando presente (13 ou 12 dígitos começando com 55).
 * - Mantém o que vier se não bater num padrão BR conhecido.
 */
export function normalizarTelefoneBR(value: string): string {
  const d = apenasDigitos(value);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) {
    return d.slice(2);
  }
  return d;
}

/**
 * Gera variantes do telefone para casar com registros gravados em formatos diferentes
 * (ex.: caixa grava sem DDI, webhook do Z-API grava com 55). Sempre retorna ao menos
 * a forma original (apenas dígitos) e a normalizada.
 */
export function gerarVariantesTelefone(value: string): string[] {
  const original = apenasDigitos(value);
  if (!original) return [];
  const canon = normalizarTelefoneBR(original);
  const variantes = new Set<string>();
  variantes.add(original);
  if (canon) {
    variantes.add(canon);
    variantes.add(`55${canon}`);
  }
  // Variante "9 extra" para celulares de 10 dígitos antigos (DDD + 9 + número)
  if (canon.length === 10) {
    const com9 = `${canon.slice(0, 2)}9${canon.slice(2)}`;
    variantes.add(com9);
    variantes.add(`55${com9}`);
  }
  // Variante "sem 9 extra" para celulares de 11 dígitos
  if (canon.length === 11 && canon[2] === "9") {
    const sem9 = `${canon.slice(0, 2)}${canon.slice(3)}`;
    variantes.add(sem9);
    variantes.add(`55${sem9}`);
  }
  return Array.from(variantes);
}
