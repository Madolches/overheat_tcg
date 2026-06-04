import { getOriginalCatalogRefs } from './cardAdjustments';

const SHARE_CODE_VERSION = 1;
const TOTAL_DECK_CARDS = 50;
const MIN_UNIQUE_CARDS = 13;
const MAX_COPIES_PER_CARD = 4;
const MAX_CATALOG_SIZE = 1023;

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

function normalizeCatalogRefs(catalogRefs: string[]) {
  return [...new Set(catalogRefs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function fnv1a32(input: string) {
  let hash = 0x811c9dc5;

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

function bitLength(value: bigint) {
  if (value <= 0n) {
    return 0;
  }

  return value.toString(2).length;
}

function chooseBigInt(n: number, k: number): bigint {
  if (k < 0 || k > n) return 0n;
  if (k === 0 || k === n) return 1n;

  let result = 1n;
  const effectiveK = Math.min(k, n - k);

  for (let i = 1; i <= effectiveK; i++) {
    result = (result * BigInt(n - effectiveK + i)) / BigInt(i);
  }

  return result;
}

const compositionMemo = new Map<string, bigint>();

function countDeckCompositions(remaining: number, slots: number): bigint {
  const key = `${remaining}:${slots}`;
  const cached = compositionMemo.get(key);
  if (cached !== undefined) {
    return cached;
  }

  if (remaining < 0 || remaining > slots * (MAX_COPIES_PER_CARD - 1)) {
    return 0n;
  }

  if (slots === 0) {
    return remaining === 0 ? 1n : 0n;
  }

  let result = 0n;
  for (let value = 0; value < MAX_COPIES_PER_CARD; value++) {
    result += countDeckCompositions(remaining - value, slots - 1);
  }

  compositionMemo.set(key, result);
  return result;
}

class BitWriter {
  private readonly bytes: number[] = [];
  private currentByte = 0;
  private bitsFilled = 0;

  write(value: bigint | number, bitCount: number) {
    if (bitCount === 0) {
      return;
    }

    const bigValue = typeof value === 'bigint' ? value : BigInt(value);
    const maxValue = (1n << BigInt(bitCount)) - 1n;
    if (bigValue < 0n || bigValue > maxValue) {
      throw new Error('分享码生成失败');
    }

    for (let bit = bitCount - 1; bit >= 0; bit--) {
      const bitValue = Number((bigValue >> BigInt(bit)) & 1n);
      this.currentByte = (this.currentByte << 1) | bitValue;
      this.bitsFilled++;

      if (this.bitsFilled === 8) {
        this.bytes.push(this.currentByte);
        this.currentByte = 0;
        this.bitsFilled = 0;
      }
    }
  }

  toUint8Array() {
    if (this.bitsFilled > 0) {
      this.currentByte <<= 8 - this.bitsFilled;
      this.bytes.push(this.currentByte);
      this.currentByte = 0;
      this.bitsFilled = 0;
    }

    return Uint8Array.from(this.bytes);
  }
}

class BitReader {
  private byteIndex = 0;
  private bitIndex = 0;

  constructor(private readonly bytes: Uint8Array) {}

  read(bitCount: number): bigint {
    if (bitCount === 0) {
      return 0n;
    }

    let value = 0n;
    for (let i = 0; i < bitCount; i++) {
      if (this.byteIndex >= this.bytes.length) {
        throw new Error('分享码已损坏');
      }

      const currentByte = this.bytes[this.byteIndex];
      const bit = (currentByte >> (7 - this.bitIndex)) & 1;
      value = (value << 1n) | BigInt(bit);

      this.bitIndex++;
      if (this.bitIndex === 8) {
        this.bitIndex = 0;
        this.byteIndex++;
      }
    }

    return value;
  }

  hasOnlyPaddingLeft() {
    if (this.byteIndex >= this.bytes.length) {
      return true;
    }

    const currentMask = this.bitIndex === 0 ? 0xff : (1 << (8 - this.bitIndex)) - 1;
    if ((this.bytes[this.byteIndex] & currentMask) !== 0) {
      return false;
    }

    for (let i = this.byteIndex + (this.bitIndex === 0 ? 0 : 1); i < this.bytes.length; i++) {
      if (this.bytes[i] !== 0) {
        return false;
      }
    }

    return true;
  }
}

function bytesToBase64(bytes: Uint8Array) {
  if (typeof btoa === 'function') {
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }

  const buffer = (globalThis as any).Buffer;
  if (buffer) {
    return buffer.from(bytes).toString('base64');
  }

  throw new Error('当前环境不支持分享码编码');
}

function base64ToBytes(base64: string) {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  const buffer = (globalThis as any).Buffer;
  if (buffer) {
    return Uint8Array.from(buffer.from(base64, 'base64'));
  }

  throw new Error('当前环境不支持分享码解码');
}

function bytesToBase64Url(bytes: Uint8Array) {
  return bytesToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(code: string) {
  if (!BASE64URL_RE.test(code)) {
    throw new Error('分享码格式不正确');
  }

  const normalized = code.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return base64ToBytes(padded);
}

function buildCatalogIndex(catalogRefs: string[]) {
  const normalizedCatalogRefs = normalizeCatalogRefs(catalogRefs);
  const indexByRef = new Map<string, number>();

  normalizedCatalogRefs.forEach((ref, index) => {
    indexByRef.set(ref, index);
  });

  return { catalogRefs: normalizedCatalogRefs, indexByRef };
}

function catalogSignature(catalogRefs: string[]) {
  return fnv1a32(`${catalogRefs.length}|${catalogRefs.join('\u001f')}`);
}

function rankCombination(indices: number[]) {
  let rank = 0n;
  for (let i = 0; i < indices.length; i++) {
    rank += chooseBigInt(indices[i], i + 1);
  }
  return rank;
}

function unrankCombination(rank: bigint, catalogSize: number, selectionSize: number) {
  const result = new Array<number>(selectionSize);
  let remainingRank = rank;
  let upperBound = catalogSize - 1;

  for (let position = selectionSize; position >= 1; position--) {
    while (upperBound >= position - 1 && chooseBigInt(upperBound, position) > remainingRank) {
      upperBound--;
    }

    if (upperBound < position - 1) {
      throw new Error('分享码已损坏');
    }

    result[position - 1] = upperBound;
    remainingRank -= chooseBigInt(upperBound, position);
    upperBound--;
  }

  return result;
}

function rankCounts(counts: number[]) {
  const uniqueCount = counts.length;
  let remaining = TOTAL_DECK_CARDS - uniqueCount;
  let rank = 0n;

  for (let i = 0; i < counts.length; i++) {
    const value = counts[i] - 1;
    if (value < 0 || value >= MAX_COPIES_PER_CARD) {
      throw new Error('分享码生成失败');
    }

    for (let candidate = 0; candidate < value; candidate++) {
      rank += countDeckCompositions(remaining - candidate, counts.length - i - 1);
    }

    remaining -= value;
  }

  if (remaining !== 0) {
    throw new Error('分享码生成失败');
  }

  return rank;
}

function unrankCounts(rank: bigint, uniqueCount: number) {
  const result: number[] = [];
  let remaining = TOTAL_DECK_CARDS - uniqueCount;
  let remainingRank = rank;

  for (let i = 0; i < uniqueCount; i++) {
    let chosen = -1;

    for (let candidate = 0; candidate < MAX_COPIES_PER_CARD; candidate++) {
      const nextRemaining = remaining - candidate;
      const ways = countDeckCompositions(nextRemaining, uniqueCount - i - 1);
      if (ways === 0n) {
        continue;
      }

      if (remainingRank < ways) {
        chosen = candidate;
        remaining = nextRemaining;
        result.push(candidate + 1);
        break;
      }

      remainingRank -= ways;
    }

    if (chosen === -1) {
      throw new Error('分享码已损坏');
    }
  }

  if (remaining !== 0) {
    throw new Error('分享码已损坏');
  }

  return result;
}

export function encodeDeckShareCode(cardRefs: string[], catalogRefs: string[]) {
  const { catalogRefs: normalizedCatalogRefs, indexByRef } = buildCatalogIndex(catalogRefs);

  if (normalizedCatalogRefs.length > MAX_CATALOG_SIZE) {
    throw new Error('当前卡牌库过大，无法生成分享码');
  }

  if (cardRefs.length !== TOTAL_DECK_CARDS) {
    throw new Error(`卡组必须正好为 ${TOTAL_DECK_CARDS} 张卡牌`);
  }

  const countsByIndex = new Map<number, number>();

  for (const ref of cardRefs) {
    const index = indexByRef.get(ref);
    if (index === undefined) {
      throw new Error('卡组中包含当前卡牌库不存在的卡牌');
    }

    const nextCount = (countsByIndex.get(index) || 0) + 1;
    if (nextCount > MAX_COPIES_PER_CARD) {
      throw new Error('同名卡牌在卡组中不能超过4张');
    }

    countsByIndex.set(index, nextCount);
  }

  const selectedEntries = [...countsByIndex.entries()].sort((a, b) => a[0] - b[0]);
  const uniqueCount = selectedEntries.length;

  if (uniqueCount < MIN_UNIQUE_CARDS || uniqueCount > TOTAL_DECK_CARDS) {
    throw new Error('卡组结构不合法');
  }

  const uniqueIndices = selectedEntries.map(([index]) => index);
  const counts = selectedEntries.map(([, count]) => count);
  const combinations = chooseBigInt(normalizedCatalogRefs.length, uniqueCount);
  const compositionCount = countDeckCompositions(TOTAL_DECK_CARDS - uniqueCount, uniqueCount);

  const combinationBits = bitLength(combinations - 1n);
  const compositionBits = bitLength(compositionCount - 1n);
  const combinationRank = rankCombination(uniqueIndices);
  const countRank = rankCounts(counts);

  const writer = new BitWriter();
  writer.write(SHARE_CODE_VERSION, 4);
  writer.write(normalizedCatalogRefs.length, 10);
  writer.write(catalogSignature(normalizedCatalogRefs), 32);
  writer.write(uniqueCount - MIN_UNIQUE_CARDS, 6);
  writer.write(combinationRank, combinationBits);
  writer.write(countRank, compositionBits);

  const code = bytesToBase64Url(writer.toUint8Array());
  if (code.length > 64) {
    throw new Error('分享码过长');
  }

  return code;
}

function decodeDeckShareCodeStrict(code: string, catalogRefs: string[]) {
  const trimmedCode = code.trim();
  if (!trimmedCode) {
    throw new Error('分享码不能为空');
  }

  const { catalogRefs: normalizedCatalogRefs } = buildCatalogIndex(catalogRefs);
  const bytes = base64UrlToBytes(trimmedCode);
  const reader = new BitReader(bytes);

  const version = Number(reader.read(4));
  if (version !== SHARE_CODE_VERSION) {
    throw new Error('分享码版本不兼容');
  }

  const encodedCatalogSize = Number(reader.read(10));
  const encodedSignature = Number(reader.read(32));
  const uniqueCount = Number(reader.read(6)) + MIN_UNIQUE_CARDS;

  if (encodedCatalogSize !== normalizedCatalogRefs.length) {
    throw new Error('分享码与当前卡牌库不匹配');
  }

  if (catalogSignature(normalizedCatalogRefs) !== encodedSignature) {
    throw new Error('分享码与当前卡牌库不匹配');
  }

  if (uniqueCount < MIN_UNIQUE_CARDS || uniqueCount > TOTAL_DECK_CARDS) {
    throw new Error('分享码已损坏');
  }

  const combinationBits = bitLength(chooseBigInt(encodedCatalogSize, uniqueCount) - 1n);
  const compositionBits = bitLength(countDeckCompositions(TOTAL_DECK_CARDS - uniqueCount, uniqueCount) - 1n);
  const combinationRank = reader.read(combinationBits);
  const countRank = reader.read(compositionBits);

  if (combinationRank >= chooseBigInt(encodedCatalogSize, uniqueCount)) {
    throw new Error('分享码已损坏');
  }

  if (countRank >= countDeckCompositions(TOTAL_DECK_CARDS - uniqueCount, uniqueCount)) {
    throw new Error('分享码已损坏');
  }

  if (!reader.hasOnlyPaddingLeft()) {
    throw new Error('分享码已损坏');
  }

  const selectedIndices = unrankCombination(combinationRank, encodedCatalogSize, uniqueCount);
  const counts = unrankCounts(countRank, uniqueCount);
  const result: string[] = [];

  for (let i = 0; i < selectedIndices.length; i++) {
    const ref = normalizedCatalogRefs[selectedIndices[i]];
    for (let count = 0; count < counts[i]; count++) {
      result.push(ref);
    }
  }

  if (result.length !== TOTAL_DECK_CARDS) {
    throw new Error('分享码已损坏');
  }

  return result;
}

export function decodeDeckShareCode(code: string, catalogRefs: string[]) {
  try {
    return decodeDeckShareCodeStrict(code, catalogRefs);
  } catch (err) {
    const legacyCatalogRefs = getOriginalCatalogRefs(catalogRefs);
    if (legacyCatalogRefs.length === catalogRefs.length) {
      throw err;
    }
    return decodeDeckShareCodeStrict(code, legacyCatalogRefs);
  }
}
