import { useState } from 'react';

// 仮のデータ構造（実際の受信ロジックと統合してください）
export const useBeaconManager = () => {
    const [devices, setDevices] = useState<any[]>([]);

    // 仕様 5.3: 30秒受信がないデータを削除
    const cleanup = () => {
        const now = Date.now();
        setDevices(prev => prev.filter(d => (now - d.lastSeen) < 30000));
    };

    // 仕様 3.2: 距離昇順（近い順）でソート
    const getSortedDevices = (weatherN: number, measuredPower: number) => {
        return [...devices].sort((a, b) => {
            const distA = Math.pow(10, (measuredPower - a.rssi) / (10 * weatherN));
            const distB = Math.pow(10, (measuredPower - b.rssi) / (10 * weatherN));
            return distA - distB;
        });
    };

    return { devices, setDevices, cleanup, getSortedDevices };
};