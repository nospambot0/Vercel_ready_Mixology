import { flavours as defaultFlavours, premixes as defaultPremixes, type Flavour, type Premix, type Strength } from '../data/flavours';
import type { FinderAnswers } from '../types';

export type Recommendation = {
  mix: Premix;
  flavours: Flavour[];
  title: string;
  description: string;
  pairing: string;
  strength: Strength;
};

const strengthWeight: Record<Strength, number> = { Light: 1, Medium: 2, Strong: 3 };

function getMixFlavours(mix: Premix, availableFlavours: Flavour[]) {
  return mix.flavourIds.map((id) => availableFlavours.find((flavour) => flavour.id === id)).filter((flavour): flavour is Flavour => Boolean(flavour));
}

function getMixStrength(mixFlavours: Flavour[]): Strength {
  const average = mixFlavours.reduce((total, flavour) => total + strengthWeight[flavour.strength], 0) / Math.max(mixFlavours.length, 1);
  if (average < 1.67) return 'Light';
  if (average > 2.33) return 'Strong';
  return 'Medium';
}

export function getRecommendations(answers: FinderAnswers, availableFlavours = defaultFlavours, availablePremixes = defaultPremixes): Recommendation[] {
  const ranked = availablePremixes
    .map((mix) => {
      const mixFlavours = getMixFlavours(mix, availableFlavours);
      const matchingTastes = mix.profile.reduce((points, tag) => points + (answers.tastes.includes(tag) ? 7 : 0), 0);
      const favouritePoints = answers.favouriteIds.reduce((points, id) => points + (mix.flavourIds.includes(id) ? 12 : 0), 0);
      const mixStrength = getMixStrength(mixFlavours);
      const strengthPoints = Math.max(0, 7 - Math.abs(strengthWeight[mixStrength] - strengthWeight[answers.strength]) * 3);
      const avoidPoints = answers.avoid.reduce((points, avoid) => {
        const target = avoid.replace('Too ', '');
        const matchesAvoid = mix.profile.includes(target) || (target === 'Strong' && mixFlavours.some((flavour) => flavour.strength === 'Strong'));
        return points + (matchesAvoid ? -12 : 0);
      }, 0);
      const surprisePoints = answers.surprise ? (mix.id === 'tropical-ice' ? 16 : 4) : 0;
      return { mix, mixFlavours, score: matchingTastes + favouritePoints + strengthPoints + avoidPoints + surprisePoints };
    })
    .sort((a, b) => b.score - a.score || a.mix.name.localeCompare(b.mix.name));

  const titles = ['Closest to your taste', 'A strong second direction', 'A wildcard worth exploring'];
  return ranked.slice(0, 3).map(({ mix, mixFlavours }, index) => ({
    mix,
    flavours: mixFlavours,
    title: titles[index] ?? 'A Hillview favourite',
    description: mix.description,
    pairing: mix.profile.slice(0, 3).join(' · '),
    strength: getMixStrength(mixFlavours),
  }));
}