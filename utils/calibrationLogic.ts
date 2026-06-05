/**
 * キャリブレーション用計算ロジック
 */

// 1. トリム平均の算出 (上下5%カット)
export const calculateTrimmedMean = (rssiList: number[]): number => {
    if (rssiList.length === 0) return 0;

    // 昇順ソート
    const sorted = [...rssiList].sort((a, b) => a - b);
    const count = sorted.length;

    // 上下5%のカット数を計算 (30個なら 30 * 0.05 = 1.5 -> 1個ずつカット)
    const cutCount = Math.floor(count * 0.05);

    // カット後の配列抽出
    const trimmed = sorted.slice(cutCount, count - cutCount);

    // 平均値を返す
    const sum = trimmed.reduce((acc, val) => acc + val, 0);
    return sum / trimmed.length;
};

// 2. 最小二乗法による MP(A) と N値 の推定
// モデル式: RSSI = MP - 10 * n * log10(d)
export const estimateParameters = (
    d1: number, rssi1: number,
    d2: number, rssi2: number,
    d3: number, rssi3: number
) => {
    const distances = [d1, d2, d3];
    const rssis = [rssi1, rssi2, rssi3];

    const x = distances.map(d => Math.log10(d));
    const y = rssis;

    const n_count = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((a, v, i) => a + v * y[i], 0);
    const sumXX = x.reduce((a, v) => a + v * v, 0);

    // 傾き (slope) = -10n
    // 切片 (intercept) = MP
    const slope = (n_count * sumXY - sumX * sumY) / (n_count * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n_count;

    const estimatedMP = Math.round(intercept * 10) / 10;
    const estimatedN = Math.round((-slope / 10) * 100) / 100;

    return { estimatedMP, estimatedN };
};