import { createCanvas } from 'canvas';
// @ts-ignore
import * as echarts from 'echarts';

console.log('Canvas imported successfully');
const canvas = createCanvas(200, 200);
console.log('Canvas created');

// @ts-ignore
const chart = echarts.init(canvas);
console.log('ECharts initialized');

chart.setOption({
    title: { text: 'test' },
    xAxis: { data: ['a', 'b'] },
    yAxis: {},
    series: [{ type: 'bar', data: [1, 2] }]
});
console.log('Option set');

chart.dispose();
console.log('Chart disposed');
