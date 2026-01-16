import { Candle } from "../model/candle.js";
import { formatCandlesWithEma } from "../util/format.js";

async function test() {
  // Mock data
  const now = Date.now();
  const candles: Candle[] = [];
  const emaData: (number | null)[] = [];

  console.log("Creating mock data...");
  for (let i = 0; i < 5; i++) {
    // timestamp, open, high, low, close, vol, volCcy, volCcyQuote, confirm
    const ts = now + i * 60000;
    // Simulate prices with some decimals to test formatting
    const open = 50000.123456 + i * 10;
    const close = 50050.987654 + i * 10;

    const data = [
      ts.toString(),
      open.toString(),
      (open + 100).toString(),
      (open - 100).toString(),
      close.toString(),
      (100.5 + i).toString(), // Volume with decimal
      "0",
      "0",
      "1",
    ];
    candles.push(new Candle(data));

    // Mock EMA
    if (i < 2) {
      emaData.push(null);
    } else {
      emaData.push(50000.555555 + i * 5);
    }
  }

  console.log("--- Testing formatCandlesWithEma ---");
  const result = formatCandlesWithEma(candles, emaData);
  console.log(result);

  // Test with mismatched lengths
  console.log("\n--- Testing with mismatched lengths ---");
  const result2 = formatCandlesWithEma(candles, emaData.slice(0, 3));
  console.log(result2);

  // Test with very small numbers
  console.log("\n--- Testing with small numbers ---");
  const smallCandles: Candle[] = [];
  const smallEma: (number | null)[] = [];
  for (let i = 0; i < 2; i++) {
    const ts = now + i * 60000;
    const price = 0.000012345 + i * 0.000001;
    const data = [
      ts.toString(),
      price.toString(),
      (price * 1.01).toString(),
      (price * 0.99).toString(),
      price.toString(),
      "1000000",
      "0",
      "0",
      "1",
    ];
    smallCandles.push(new Candle(data));
    smallEma.push(price);
  }
  console.log(formatCandlesWithEma(smallCandles, smallEma));
}

test();
