/**
 * Estabilizador de transcrição em streaming.
 *
 * O STT reprocessa todo o áudio a cada janela, por isso cada hipótese pode
 * reescrever palavras anteriores. Mostrar a hipótese crua provoca oscilação
 * ("tremor") e palavras duplicadas. Aqui:
 *
 * 1. Cada hipótese é comparada palavra a palavra com a anterior.
 * 2. Uma palavra só passa a "estável" depois de aparecer no mesmo sítio em
 *    N hipóteses seguidas (`agree`). Antes disso fica em "tentativa".
 * 3. A parte estável nunca recua nem é reescrita; só a cauda muda.
 * 4. Repetições no ponto de junção (o STT costuma repetir a última palavra
 *    entre janelas) são removidas.
 */

export type TranscriptUpdate = {
  /** Texto já consolidado — não volta a mudar. */
  stable: string;
  /** Cauda ainda provisória, pode ser reescrita na próxima hipótese. */
  tentative: string;
  /** stable + tentative, pronto a mostrar. */
  text: string;
  /** true quando a hipótese é o resultado final do turno. */
  final: boolean;
};

const PUNCT = /[.,!?;:…]+$/u;

function words(value: string): string[] {
  return value.trim().split(/\s+/u).filter(Boolean);
}

/** Forma canónica para comparar palavras (ignora pontuação e maiúsculas). */
function key(word: string): string {
  return word.replace(PUNCT, "").toLocaleLowerCase();
}

/** Remove a repetição no ponto de junção: "olá bom | bom dia" -> "olá bom dia". */
function dedupeJoin(stable: string[], tail: string[]): string[] {
  const max = Math.min(4, stable.length, tail.length);
  for (let size = max; size > 0; size -= 1) {
    let same = true;
    for (let index = 0; index < size; index += 1) {
      if (key(stable[stable.length - size + index]!) !== key(tail[index]!)) {
        same = false;
        break;
      }
    }
    if (same) return tail.slice(size);
  }
  return tail;
}

export class TranscriptStabilizer {
  private stable: string[] = [];
  private previous: string[] = [];
  private agreement: number[] = [];
  private readonly agree: number;

  constructor(agree = 2) {
    this.agree = Math.max(1, agree);
  }

  reset() {
    this.stable = [];
    this.previous = [];
    this.agreement = [];
  }

  /** Uma nova hipótese completa do STT para o turno atual. */
  push(hypothesis: string, final = false): TranscriptUpdate {
    const next = words(hypothesis);

    if (final) {
      // O resultado final manda: mantém-se o prefixo estável e junta-se o resto
      // sem duplicar o que já estava consolidado.
      const merged = next.length ? this.mergeFinal(next) : this.stable.slice();
      this.stable = merged;
      this.previous = merged.slice();
      this.agreement = merged.map(() => this.agree);
      return this.snapshot("", true);
    }

    if (next.length === 0) return this.snapshot("", false);

    // A hipótese nova tem de respeitar o prefixo já consolidado.
    const start = this.matchStable(next);
    const tail = start === null ? dedupeJoin(this.stable, next) : next.slice(start);

    // Conta concordância posição a posição com a hipótese anterior.
    const agreement: number[] = [];
    for (let index = 0; index < tail.length; index += 1) {
      const same =
        this.previous[index] !== undefined && key(this.previous[index]!) === key(tail[index]!);
      agreement[index] = same ? (this.agreement[index] ?? 0) + 1 : 1;
    }

    // Consolida o prefixo com concordância suficiente. Nunca consolida a última
    // palavra: pode ainda estar a ser dita.
    let commit = 0;
    const limit = Math.max(0, tail.length - 1);
    while (commit < limit && (agreement[commit] ?? 0) >= this.agree) commit += 1;

    if (commit > 0) {
      this.stable = this.stable.concat(tail.slice(0, commit));
      this.previous = tail.slice(commit);
      this.agreement = agreement.slice(commit);
      return this.snapshot(this.previous.join(" "), false);
    }

    this.previous = tail;
    this.agreement = agreement;
    return this.snapshot(tail.join(" "), false);
  }

  /**
   * Se a hipótese repete o prefixo estável, devolve o índice onde começa a
   * novidade; devolve null quando o STT reescreveu o início (aí só se apara a
   * junção, sem desfazer o que já foi mostrado).
   */
  private matchStable(next: string[]): number | null {
    if (this.stable.length === 0) return 0;
    if (next.length < this.stable.length) return null;
    for (let index = 0; index < this.stable.length; index += 1) {
      if (key(this.stable[index]!) !== key(next[index]!)) return null;
    }
    return this.stable.length;
  }

  private mergeFinal(next: string[]): string[] {
    const start = this.matchStable(next);
    if (start !== null) return next;
    return this.stable.concat(dedupeJoin(this.stable, next));
  }

  private snapshot(tentative: string, final: boolean): TranscriptUpdate {
    const stable = this.stable.join(" ");
    const text = [stable, tentative].filter(Boolean).join(" ");
    return { stable, tentative, text, final };
  }
}
