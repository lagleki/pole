/** TV scoring after a successful letter open (DIFF #26). */
export type LetterAward =
  | { readonly kind: 'perHit'; readonly unit: number }
  | { readonly kind: 'double' }
  | { readonly kind: 'keep' };

export type AwardKind = LetterAward['kind'];

export type TurnOutcome = 'again' | 'next' | 'won';

/** Flattened award stored in resume checkpoints. */
export interface ResumeAwardFields {
  readonly awardKind: AwardKind;
  readonly awardUnit: number;
}

export function letterAwardFromResume(awardKind: AwardKind, awardUnit: number): LetterAward {
  if (awardKind === 'perHit') {
    return { kind: 'perHit', unit: awardUnit };
  }
  if (awardKind === 'double') {
    return { kind: 'double' };
  }
  return { kind: 'keep' };
}

export function awardUnitForPersist(award: LetterAward): number | undefined {
  return award.kind === 'perHit' ? award.unit : undefined;
}
