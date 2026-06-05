// utils/beaconLogic.ts

export type WeatherType = 'SUNNY' | 'RAINY' | 'FOGGY';

/**
 * ビーコン設定の型定義
 */
export interface BeaconConfig {
    measuredPower: number;
    n: number;
    thresholdRed: number;
    thresholdYellow: number;
    kalmanR: number;
    filterUuid: string;
}

/**
 * スマートフィルタ（カルマンフィルタ）
 * RSSIの変動を抑え、表示を安定させます
 */
export class SmartFilter {
    private r: number;
    private x: number | null = null;
    constructor(r: number) { this.r = r; }
    updateR(newR: number) { this.r = newR; }
    filter(measurement: number) {
        if (this.x === null) { this.x = measurement; return this.x; }
        const k = 1 / (1 + this.r);
        this.x = this.x + k * (measurement - this.x);
        return this.x;
    }
}

/**
 * 距離計算アルゴリズム
 * d = 10 ^ ((Measured Power - RSSI) / (10 * n))
 */
export const calculateDistance = (rssi: number, config: { measuredPower: number, n: number }): number => {
    return Math.pow(10, (config.measuredPower - rssi) / (10 * config.n));
};

/**
 * 距離に応じた色（境界値）の判定
 * 仕様書 Phase A の色分け準拠
 */
export const getStatusColor = (distance: number): string => {
    if (distance < 5) return '#EF4444';    // 5m未満：赤
    if (distance < 15) return '#F59E0B';   // 5〜15m：黄
    return '#10B981';                      // 15m以上：青(緑)
};

/**
 * 2m未満の至近距離判定（赤点滅用）
 */
export const isCriticalDistance = (distance: number): boolean => {
    return distance < 2.0;
};