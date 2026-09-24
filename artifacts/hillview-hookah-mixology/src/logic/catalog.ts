import { flavours as defaultFlavours, premixes as defaultPremixes } from '../data/flavours';
import type { Catalog } from '../types';

export const CATALOG_STORAGE_KEY = 'mixology-pro-catalog';

function isValidFlavour(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const flavour = value as Record<string, unknown>;
  return typeof flavour.id === 'string'
    && typeof flavour.name === 'string'
    && Array.isArray(flavour.tags)
    && typeof flavour.strength === 'string'
    && typeof flavour.character === 'string'
    && flavour.orb
    && typeof flavour.orb === 'object';
}

function isValidPremix(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const premix = value as Record<string, unknown>;
  return typeof premix.id === 'string'
    && typeof premix.name === 'string'
    && Array.isArray(premix.flavourIds)
    && Array.isArray(premix.recipe)
    && Array.isArray(premix.profile)
    && typeof premix.description === 'string'
    && typeof premix.bestFor === 'string';
}

export function readCatalog(): Catalog {
  try {
    const saved = localStorage.getItem(CATALOG_STORAGE_KEY);
    if (!saved) return { flavours: defaultFlavours, premixes: defaultPremixes };
    const parsed = JSON.parse(saved) as Partial<Catalog>;
    const savedFlavours = Array.isArray(parsed.flavours) ? parsed.flavours.filter(isValidFlavour) : [];
    const savedPremixes = Array.isArray(parsed.premixes) ? parsed.premixes.filter(isValidPremix) : [];
    const refreshedFlavours = savedFlavours.map((savedFlavour) => {
      const defaultFlavour = defaultFlavours.find((flavour) => flavour.id === savedFlavour.id);
      if (!defaultFlavour) return savedFlavour;
      return {
        ...savedFlavour,
        brand: defaultFlavour.brand,
        photoUrl: defaultFlavour.photoUrl ?? savedFlavour.photoUrl,
      };
    });
    return {
      flavours: Array.isArray(parsed.flavours) ? refreshedFlavours as Catalog['flavours'] : defaultFlavours,
      premixes: Array.isArray(parsed.premixes) ? savedPremixes as Catalog['premixes'] : defaultPremixes,
    };
  } catch {
    return { flavours: defaultFlavours, premixes: defaultPremixes };
  }
}