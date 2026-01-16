import { calculateEMA, calculateEMA20 } from '../util/indicator.js';
import { Candle } from '../model/candle.js';
import { getCandles } from '../connect/market.js';
// Test case 1: Simple number array with period 3
const prices = [10, 11, 12, 13, 14];
const period = 3;
console.log('--- Test 1: Number array, period 3 ---');
const ema3 = calculateEMA(prices, period);
console.log('Prices:', prices);
console.log('EMA3 Result:', ema3);
// Expected: [null, null, 11, 12, 13]

// Test case 2: Candle objects
console.log('\n--- Test 2: Candle objects, period 3 ---');
const candles = await getCandles('BTC-USDT-SWAP', '1H', '40');
console.log('Candles length:', candles);
const ema3Candles = calculateEMA(candles, 20);
console.log('EMA3 (Candles) Result:', ema3Candles);


// Test case 3: EMA20 with sufficient data
console.log('\n--- Test 3: EMA20 with 30 data points ---');
const data20 = Array.from({ length: 30 }, (_, i) => i + 1); // 1 to 30
const ema20 = calculateEMA20(data20);
console.log('Data length:', data20.length);
console.log('EMA20 length:', ema20.length);
console.log('EMA20 last value:', ema20[ema20.length - 1]);
console.log('EMA20 first valid index (should be 19):', ema20.findIndex(x => x !== null));

