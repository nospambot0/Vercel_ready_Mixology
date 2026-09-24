import type { Choice } from '../types';
import { getRecipeForChoice } from './recipe';
import type { Flavour, Premix } from '../data/flavours';

export const WHATSAPP_DESTINATION = '917978443720';

export function buildWhatsAppMessage(choice: Choice, availableFlavours?: Flavour[], availablePremixes?: Premix[]): string {
  const flavourText = getRecipeForChoice(choice, availableFlavours, availablePremixes)
    .map(({ flavour, percentage, customization }) => `${flavour.name} — ${percentage}% (${customization})`)
    .join('\n');

  return [
    'Hello Hillview Hookah Expert,',
    '',
    'I found my customised choice with Hillview Hookah Mixology.',
    '',
    `Recommended Mix: ${choice.mixName || 'A thoughtful Hillview mix'}`,
    `Flavours:\n${flavourText || 'Surprise me with a thoughtful mix.'}`,
    `Taste: ${choice.tastes.length ? choice.tastes.join(', ') : 'Surprise me'}`,
    `Strength: ${choice.strength}`,
    `Avoid: ${choice.avoid.length ? choice.avoid.join(', ') : 'Nothing noted'}`,
    `Remarks: ${choice.remarks.trim() || 'None'}`,
    '',
    'Please prepare this choice for my table.',
    '— Hillview Hookah Mixology',
  ].join('\n');
}

export function getWhatsAppUrl(choice: Choice, availableFlavours?: Flavour[], availablePremixes?: Premix[]): string {
  return `https://wa.me/${WHATSAPP_DESTINATION}?text=${encodeURIComponent(buildWhatsAppMessage(choice, availableFlavours, availablePremixes))}`;
}