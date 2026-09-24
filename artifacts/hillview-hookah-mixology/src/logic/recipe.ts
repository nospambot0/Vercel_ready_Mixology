import { flavours as defaultFlavours, premixes as defaultPremixes, type Flavour, type Premix } from '../data/flavours';
import type { Choice, CustomLevel } from '../types';

export type RecipeLine = {
  flavour: Flavour;
  percentage: number;
  customization: CustomLevel;
};

const customizationMultiplier: Record<CustomLevel, number> = {
  Less: 0.75,
  Normal: 1,
  More: 1.25,
};

function normalizePercentages(lines: Array<Omit<RecipeLine, 'percentage'> & { percentage: number }>) {
  const total = lines.reduce((sum, line) => sum + line.percentage, 0);
  if (!total) return lines;

  const normalized = lines.map((line) => ({ ...line, percentage: Math.round((line.percentage / total) * 1000) / 10 }));
  const correction = Math.round((100 - normalized.reduce((sum, line) => sum + line.percentage, 0)) * 10) / 10;
  if (normalized.length) normalized[normalized.length - 1].percentage += correction;
  return normalized;
}

export function getRecipeForChoice(choice: Choice, availableFlavours = defaultFlavours, availablePremixes = defaultPremixes): RecipeLine[] {
  const premix = availablePremixes.find((item) => item.id === choice.mixId) as Premix | undefined;
  const selectedFlavours = (choice.flavourIds ?? []).map((id) => availableFlavours.find((flavour) => flavour.id === id)).filter((flavour): flavour is Flavour => Boolean(flavour));
  if (!selectedFlavours.length) return [];

  const hasPremixRecipe = Boolean(premix && selectedFlavours.length === premix.recipe.length && selectedFlavours.every((flavour) => premix.recipe.some((ingredient) => ingredient.flavourId === flavour.id)));
  const baseLines = selectedFlavours.map((flavour) => {
    const basePercentage = hasPremixRecipe ? premix?.recipe.find((ingredient) => ingredient.flavourId === flavour.id)?.percentage ?? 0 : 100 / selectedFlavours.length;
    const customization = choice.customizations?.[flavour.id] ?? 'Normal';
    return {
      flavour,
      percentage: basePercentage * customizationMultiplier[customization],
      customization,
    };
  });

  return normalizePercentages(baseLines);
}

export function getBatchRecipe(choice: Choice, batchSize: number, availableFlavours = defaultFlavours, availablePremixes = defaultPremixes) {
  return getRecipeForChoice(choice, availableFlavours, availablePremixes).map((line) => ({
    ...line,
    amount: Math.round((batchSize * line.percentage) / 100 * 10) / 10,
  }));
}