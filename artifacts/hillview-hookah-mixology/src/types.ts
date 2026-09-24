import type { Flavour, Premix, Strength } from './data/flavours';

export type CustomLevel = 'Less' | 'Normal' | 'More';

export type FinderAnswers = {
  tastes: string[];
  strength: Strength;
  favouriteIds: string[];
  avoid: string[];
  surprise: boolean;
};

export type Choice = {
  mixId: string;
  mixName: string;
  flavourIds: string[];
  tastes: string[];
  strength: Strength;
  favouriteIds: string[];
  avoid: string[];
  customizations: Record<string, CustomLevel>;
  percentages?: Record<string, number>;
  remarks: string;
  chosenAt: string;
};

export type Catalog = {
  flavours: Flavour[];
  premixes: Premix[];
};

export type MixView = {
  flavours: Flavour[];
  answer: FinderAnswers;
  customizations: Record<string, CustomLevel>;
};