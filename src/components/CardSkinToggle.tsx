import React from 'react';
import type { Card } from '../types/game';
import { getCardSkin } from '../data/cardSkins';
import { useCardSkinSettings } from '../hooks/useCardSkinSettings';
import { cn } from '../lib/utils';

interface CardSkinToggleProps {
  card: Card;
  className?: string;
  checked?: boolean;
  onChange?: (enabled: boolean) => void;
  label?: string;
}

export const CardSkinToggle: React.FC<CardSkinToggleProps> = ({
  card,
  className,
  checked,
  onChange,
  label = '卡牌皮肤'
}) => {
  const skin = getCardSkin(card);
  const { isCardSkinEnabled, setCardSkinEnabled } = useCardSkinSettings();

  if (!skin) return null;

  const enabled = checked ?? isCardSkinEnabled(card);
  const handleChange = () => {
    if (onChange) onChange(!enabled);
    else setCardSkinEnabled(card, !enabled);
  };

  return (
    <div className={cn('rounded-2xl border border-white/5 bg-zinc-800/50 px-4 py-3', className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-zinc-500">{label}</p>
          <p className="mt-1 truncate text-sm font-black text-white">{skin.name}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={handleChange}
          className={cn(
            'relative h-7 w-12 shrink-0 rounded-full border transition-colors',
            enabled
              ? 'border-red-400/50 bg-red-600'
              : 'border-zinc-600 bg-zinc-900'
          )}
          title={enabled ? '关闭该卡牌皮肤' : '开启该卡牌皮肤'}
        >
          <span
            className={cn(
              'absolute top-1 h-5 w-5 rounded-full bg-white shadow-lg transition-transform',
              enabled ? 'translate-x-5' : 'translate-x-1'
            )}
          />
        </button>
      </div>
    </div>
  );
};
