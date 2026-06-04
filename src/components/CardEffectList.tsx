import React from 'react';
import { Card, CardEffect } from '../types/game';
import { cn } from '../lib/utils';

const EFFECT_TYPE_LABELS: Record<string, string> = {
  ACTIVATE: '主动',
  ACTIVATED: '主动',
  TRIGGER: '诱发',
  TRIGGERED: '诱发',
  CONTINUOUS: '持续',
  ALWAYS: '常驻'
};

const getEffectTypeLabel = (type?: string) => {
  if (!type) return '效果';
  return EFFECT_TYPE_LABELS[type] || type;
};

const getEffectLimitLabel = (effect: CardEffect) => {
  if (!effect.limitCount) return null;
  const scope = effect.limitGlobal ? '整局' : '每回合';
  const nameScope = effect.limitNameType ? '同名' : '单卡';
  return `${scope}${nameScope}${effect.limitCount}次`;
};

interface CardEffectListProps {
  card: Card;
  className?: string;
  compact?: boolean;
}

export const CardEffectList: React.FC<CardEffectListProps> = ({ card, className, compact = false }) => {
  const effects = card.effects || [];

  return (
    <div className={cn('space-y-3', className)}>
      {card.adjustmentVersion === 'adjusted' && (
        <div className={cn(
          'rounded-xl border border-cyan-300/25 bg-cyan-400/10 text-cyan-50',
          compact ? 'p-2' : 'p-3'
        )}>
          <div className="inline-flex rounded-full border border-cyan-200/30 bg-cyan-300/15 px-2 py-0.5 text-[10px] font-black tracking-widest text-cyan-100">
            {card.adjustmentLabel || '调整后'}
          </div>
          {card.adjustmentDescription && (
            <div className={cn('mt-2 leading-relaxed text-cyan-50/80', compact ? 'text-[11px]' : 'text-xs')}>
              {card.adjustmentDescription}
            </div>
          )}
        </div>
      )}

      {effects.length === 0 ? (
        <div className={cn(
          'rounded-xl border border-white/10 bg-white/5 text-center font-bold text-white/35',
          compact ? 'p-3 text-[11px]' : 'p-4 text-sm'
        )}>
          暂无可显示效果
        </div>
      ) : (
        effects.map((effect, index) => {
          const limitLabel = getEffectLimitLabel(effect);
          const text = effect.description || effect.content || '暂无效果文本';

          return (
            <div
              key={effect.id || `${card.uniqueId}-effect-${index}`}
              className={cn(
                'rounded-xl border border-white/10 bg-white/[0.045] text-white shadow-inner',
                compact ? 'p-2.5' : 'p-4'
              )}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-[#f27d26]/20 px-2 py-0.5 text-[10px] font-black tracking-widest text-[#ffb071]">
                  {getEffectTypeLabel(effect.type)}
                </span>
                {limitLabel && (
                  <span className="rounded-md border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] font-bold text-white/45">
                    {limitLabel}
                  </span>
                )}
              </div>
              <div className={cn('whitespace-pre-wrap leading-relaxed text-white/80', compact ? 'text-[11px]' : 'text-sm')}>
                {text}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};
