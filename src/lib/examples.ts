import { N } from '../i18n'
import { uid, type Comp, type Doc, type Label, type Rot, type Wire } from './model'
import { SYMBOLS } from './symbols'

class Builder {
  comps: Comp[] = []
  wires: Wire[] = []
  labels: Label[] = []
  part(type: string, x: number, y: number, ref: string, value: string, rot: Rot = 0, extra: Partial<Comp> = {}): this {
    this.comps.push({ id: uid(), type, x, y, rot, mirror: false, ref: SYMBOLS[type].refAt === null ? '' : ref, value, ...extra })
    return this
  }
  /** A polyline of wires through the given points. */
  wire(...pts: [number, number][]): this {
    for (let i = 1; i < pts.length; i++) this.wires.push({ id: uid(), x1: pts[i - 1][0], y1: pts[i - 1][1], x2: pts[i][0], y2: pts[i][1] })
    return this
  }
  net(x: number, y: number, text: string, flip = false): this {
    this.labels.push({ id: uid(), x, y, text, kind: 'net', ...(flip ? { flip } : {}) })
    return this
  }
  note(x: number, y: number, text: string): this {
    this.labels.push({ id: uid(), x, y, text, kind: 'text' })
    return this
  }
  done(title: string): Doc {
    return { title, comps: this.comps, wires: this.wires, labels: this.labels }
  }
}

function ledResistor(): Doc {
  return new Builder()
    .part('battery', 4, 12, 'BT1', '5V')
    .part('resistor', 12, 10, 'R1', '330')
    .part('led', 18, 10, 'D1', 'Red LED')
    .part('ground', 4, 16, '', 'GND')
    .part('ground', 22, 16, '', 'GND')
    .wire([4, 10], [10, 10])
    .wire([14, 10], [16, 10])
    .wire([20, 10], [22, 10], [22, 16])
    .wire([4, 14], [4, 16])
    .note(2, 21, 'I = (5 V - 2 V) / 330 Ω ≈ 9 mA')
    .done('LED with series resistor')
}

function rcLowPass(): Doc {
  return new Builder()
    .part('vac', 4, 12, 'V1', '1Vpk')
    .part('resistor', 12, 10, 'R1', '1k')
    .part('capacitor', 18, 13, 'C1', '100n', 90)
    .part('ground', 4, 17, '', 'GND')
    .part('ground', 18, 17, '', 'GND')
    .wire([4, 10], [10, 10])
    .wire([14, 10], [18, 10])
    .wire([18, 10], [18, 11])
    .wire([18, 10], [24, 10])
    .wire([18, 15], [18, 17])
    .wire([4, 14], [4, 17])
    .net(24, 10, 'Vout')
    .note(2, 21, 'fc = 1 / (2πRC) ≈ 1.6 kHz')
    .done('RC low-pass filter')
}

function invertingAmp(): Doc {
  return new Builder()
    .part('vac', 4, 13, 'V1', '1Vpk')
    .part('resistor', 10, 11, 'R1', '10k')
    .part('resistor', 20, 1, 'R2', '47k')
    .part('opamp', 20, 12, 'U1', 'LM358')
    .part('vcc', 20, 7, 'PWR1', '+12V')
    .part('vcc', 20, 17, 'PWR2', '-12V', 180)
    .part('ground', 14, 16, '', 'GND')
    .part('ground', 4, 17, '', 'GND')
    .wire([4, 11], [8, 11])
    .wire([12, 11], [14, 11])
    .wire([14, 11], [16, 11])
    .wire([14, 11], [14, 1], [18, 1])
    .wire([22, 1], [26, 1], [26, 12])
    .wire([24, 12], [26, 12])
    .wire([26, 12], [28, 12])
    .wire([16, 13], [14, 13], [14, 16])
    .wire([20, 9], [20, 7])
    .wire([20, 15], [20, 17])
    .wire([4, 15], [4, 17])
    .net(28, 12, 'Vout')
    .note(2, 21, 'Gain = -R2 / R1 = -4.7')
    .done('Inverting amplifier')
}

function commonEmitter(): Doc {
  return new Builder()
    .part('resistor', 10, 8, 'R1', '47k', 90)
    .part('resistor', 10, 14, 'R2', '10k', 90)
    .part('resistor', 19, 7, 'R3', '4.7k', 90)
    .part('resistor', 19, 17, 'R4', '1k', 90)
    .part('npn', 18, 12, 'Q1', '2N3904')
    .part('capacitor-pol', 6, 12, 'C1', '10µ')
    .part('capacitor-pol', 25, 9, 'C2', '10µ')
    .part('vcc', 19, 4, 'PWR1', '+12V')
    .part('ground', 10, 21, '', 'GND')
    .part('ground', 19, 21, '', 'GND')
    .wire([10, 6], [10, 4], [19, 4])
    .wire([19, 5], [19, 4])
    .wire([10, 10], [10, 12])
    .wire([10, 12], [16, 12])
    .wire([8, 12], [10, 12])
    .wire([10, 16], [10, 21])
    .wire([19, 9], [19, 10])
    .wire([19, 9], [23, 9])
    .wire([19, 14], [19, 15])
    .wire([19, 19], [19, 21])
    .wire([2, 12], [4, 12])
    .wire([27, 9], [29, 9])
    .net(2, 12, 'Vin', true)
    .net(29, 9, 'Vout')
    .note(2, 25, 'Class-A common-emitter stage, gain ≈ -R3 / R4')
    .done('Common-emitter amplifier')
}

function astable555(): Doc {
  return new Builder()
    .part('ic', 18, 12, 'U1', 'NE555', 0, { pins: 8, pinNames: 'GND,TRIG,OUT,RESET,CTRL,THR,DIS,VCC' })
    .part('resistor', 28, 8, 'R1', '4.7k', 90)
    .part('resistor', 28, 14, 'R2', '10k', 90)
    .part('capacitor', 28, 21, 'C1', '100n', 90)
    .part('vcc', 23, 6, 'PWR1', '+9V')
    .part('ground', 13, 9, '', 'GND', 90)
    .part('ground', 28, 25, '', 'GND')
    .wire([13, 15], [6, 15], [6, 6], [23, 6])
    .wire([23, 9], [23, 6])
    .wire([23, 6], [28, 6])
    .wire([28, 10], [28, 11])
    .wire([28, 11], [28, 12])
    .wire([23, 11], [28, 11])
    .wire([13, 11], [8, 11], [8, 18], [26, 18])
    .wire([23, 13], [26, 13], [26, 18])
    .wire([26, 18], [28, 18])
    .wire([28, 16], [28, 18])
    .wire([28, 18], [28, 19])
    .wire([28, 23], [28, 25])
    .wire([13, 13], [12, 13])
    .net(12, 13, 'OUT', true)
    .note(2, 28, 'f = 1.44 / ((R1 + 2 R2) C1) ≈ 580 Hz')
    .done('555 astable oscillator')
}

export interface Example {
  id: string
  name: string
  build: () => Doc
}

export const EXAMPLES: Example[] = [
  { id: 'ce', name: N('Common-emitter amplifier'), build: commonEmitter },
  { id: 'inv', name: N('Inverting op-amp amplifier'), build: invertingAmp },
  { id: 'rc', name: N('RC low-pass filter'), build: rcLowPass },
  { id: 'led', name: N('LED with resistor'), build: ledResistor },
  { id: '555', name: N('555 astable oscillator'), build: astable555 },
]
