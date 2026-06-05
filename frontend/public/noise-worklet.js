/**
 * noise-worklet.js - Lumina Meet
 *
 * Drop this into /public/noise-worklet.js (served as a static asset).
 *
 * Pipeline (runs in AudioWorkletGlobalScope, off the main thread):
 *   1. Spectral gate    - suppresses frames below an adaptive noise floor
 *   2. 3-band EQ        - rolls off mud (<120 Hz) and harshness (>8 kHz),
 *                         gently lifts presence (2-5 kHz) for speech clarity
 *   3. Transient limiter- prevents clipping on sudden loud events
 *
 * Falls back gracefully to the gain-gate in useNoiseSuppression.ts if
 * this file 404s or the browser doesn't support AudioWorklet.
 */

const FRAME = 128; // frames per process() call (Web Audio spec)
const SAMPLE_RATE = 48000; // expected, matches getUserMedia constraint
const FFT_SIZE = 512;
const HALF = FFT_SIZE / 2;

// ─── Tiny FFT (Cooley-Tukey, real-valued, in-place) ──────────────────────────
function fft(re, im) {
  const n = re.length;
  // Bit-reverse permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  // Butterfly
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang),
      wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1,
        curIm = 0;
      for (let j = 0; j < len / 2; j++) {
        const uRe = re[i + j],
          uIm = im[i + j];
        const vRe = re[i + j + len / 2] * curRe - im[i + j + len / 2] * curIm;
        const vIm = re[i + j + len / 2] * curIm + im[i + j + len / 2] * curRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + len / 2] = uRe - vRe;
        im[i + j + len / 2] = uIm - vIm;
        const newRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = newRe;
      }
    }
  }
}

function ifft(re, im) {
  fft(im, re); // swap → inverse
  const n = re.length;
  for (let i = 0; i < n; i++) {
    re[i] /= n;
    im[i] /= n;
  }
}

// ─── Hann window ─────────────────────────────────────────────────────────────
const HANN = new Float32Array(FFT_SIZE);
for (let i = 0; i < FFT_SIZE; i++) HANN[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / FFT_SIZE));

// ─── Biquad coefficients (normalised, fs = 48000) ────────────────────────────
// Returns [b0, b1, b2, a1, a2] (a0 = 1 normalised)
function highpass(fc, q) {
  const w0 = (2 * Math.PI * fc) / SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * q);
  const cosW0 = Math.cos(w0);
  const a0 = 1 + alpha;
  return [
    (1 + cosW0) / 2 / a0,
    -(1 + cosW0) / a0,
    (1 + cosW0) / 2 / a0,
    (-2 * cosW0) / a0,
    (1 - alpha) / a0,
  ];
}

function lowpass(fc, q) {
  const w0 = (2 * Math.PI * fc) / SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * q);
  const cosW0 = Math.cos(w0);
  const a0 = 1 + alpha;
  return [
    (1 - cosW0) / 2 / a0,
    (1 - cosW0) / a0,
    (1 - cosW0) / 2 / a0,
    (-2 * cosW0) / a0,
    (1 - alpha) / a0,
  ];
}

function peakingEQ(fc, q, gainDb) {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * fc) / SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * q);
  const cosW0 = Math.cos(w0);
  const a0 = 1 + alpha / A;
  return [
    (1 + alpha * A) / a0,
    (-2 * cosW0) / a0,
    (1 - alpha * A) / a0,
    (-2 * cosW0) / a0,
    (1 - alpha / A) / a0,
  ];
}

class Biquad {
  constructor(coeffs) {
    [this.b0, this.b1, this.b2, this.a1, this.a2] = coeffs;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
  process(x) {
    const y =
      this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
  update(coeffs) {
    [this.b0, this.b1, this.b2, this.a1, this.a2] = coeffs;
  }
}

// ─── Processor ───────────────────────────────────────────────────────────────

class NoiseSuppressorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Overlap-add buffers
    this._inputBuf = new Float32Array(FFT_SIZE);
    this._outputBuf = new Float32Array(FFT_SIZE);
    this._overlap = new Float32Array(HALF); // 50% overlap

    // FFT work arrays
    this._re = new Float32Array(FFT_SIZE);
    this._im = new Float32Array(FFT_SIZE);

    // Adaptive noise floor (per spectral bin), initialised to a small value
    this._noiseFloor = new Float32Array(HALF).fill(1e-6);
    this._calibFrames = 0;
    this._CALIB = 20; // first 20 FFT frames used to calibrate noise floor

    // EQ chain - sculpt for speech clarity
    // 1. High-pass at 100 Hz (roll off room rumble, HVAC)
    // 2. Peaking -3 dB at 300 Hz (reduce mud / boxiness)
    // 3. Peaking +2 dB at 3.5 kHz (presence lift for intelligibility)
    // 4. Low-pass at 9 kHz (de-harshness, reduces mic self-noise)
    this._hp = new Biquad(highpass(100, 0.707));
    this._mud = new Biquad(peakingEQ(300, 0.8, -3));
    this._pres = new Biquad(peakingEQ(3500, 1.2, 2));
    this._lp = new Biquad(lowpass(9000, 0.707));

    // Limiter state
    this._limGain = 1;
    this._LIMIT_THRESH = 0.92;
    this._LIMIT_ATTACK = 0.001; // very fast
    this._LIMIT_RELEASE = 0.05;

    this._hopCount = 0;
  }

  static get parameterDescriptors() {
    return [
      { name: "noiseReduction", defaultValue: 0.85, minValue: 0, maxValue: 1 },
      { name: "eqEnabled", defaultValue: 1, minValue: 0, maxValue: 1 },
    ];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;

    const nr = parameters.noiseReduction[0] ?? 0.85;
    const eq = (parameters.eqEnabled[0] ?? 1) > 0.5;

    // ── Shift input buffer left by FRAME, append new frame ────────────────
    this._inputBuf.copyWithin(0, FRAME);
    this._inputBuf.set(input, FFT_SIZE - FRAME);

    this._hopCount++;
    // Process every 2 hops (hop size = FRAME, so we process every 256 samples → 50% overlap)
    if (this._hopCount % 2 === 0) {
      this._processFrame(nr);
    }

    // ── Read FRAME samples from overlap-add output buffer ─────────────────
    for (let i = 0; i < FRAME; i++) {
      let s = this._outputBuf[i];

      // ── EQ chain ──────────────────────────────────────────────────────
      if (eq) {
        s = this._hp.process(s);
        s = this._mud.process(s);
        s = this._pres.process(s);
        s = this._lp.process(s);
      }

      // ── Transient limiter ────────────────────────────────────────────
      const abs = Math.abs(s);
      if (abs * this._limGain > this._LIMIT_THRESH) {
        const target = this._LIMIT_THRESH / (abs + 1e-9);
        this._limGain += (target - this._limGain) * this._LIMIT_ATTACK;
      } else {
        this._limGain += (1 - this._limGain) * this._LIMIT_RELEASE;
      }
      output[i] = s * Math.min(this._limGain, 1);
    }

    // Shift output buffer
    this._outputBuf.copyWithin(0, FRAME);
    this._outputBuf.fill(0, FFT_SIZE - FRAME);

    return true;
  }

  _processFrame(nr) {
    // Apply Hann window and copy into FFT arrays
    for (let i = 0; i < FFT_SIZE; i++) {
      this._re[i] = this._inputBuf[i] * HANN[i];
      this._im[i] = 0;
    }

    fft(this._re, this._im);

    // Compute magnitude spectrum
    const mag = new Float32Array(HALF);
    for (let k = 0; k < HALF; k++) {
      mag[k] = Math.sqrt(this._re[k] ** 2 + this._im[k] ** 2);
    }

    // ── Calibrate noise floor using first CALIB frames ──────────────────
    if (this._calibFrames < this._CALIB) {
      for (let k = 0; k < HALF; k++) {
        if (mag[k] > this._noiseFloor[k]) this._noiseFloor[k] = mag[k];
      }
      this._calibFrames++;
      // During calibration just pass audio through (scaled)
      ifft(this._re, this._im);
      this._overlapAdd();
      return;
    }

    // ── Spectral gating: Wiener-style soft mask ──────────────────────────
    // mask[k] = max(0, 1 - α * noiseFloor[k] / (mag[k] + ε))
    const alpha = nr * 1.5; // overshoot factor → stronger suppression
    for (let k = 0; k < HALF; k++) {
      const mask = Math.max(0, 1 - (alpha * this._noiseFloor[k]) / (mag[k] + 1e-9));
      // Apply mask to both this bin and its mirror
      this._re[k] *= mask;
      this._im[k] *= mask;
      if (k > 0 && k < HALF) {
        this._re[FFT_SIZE - k] *= mask;
        this._im[FFT_SIZE - k] *= mask;
      }
      // Slowly adapt noise floor upward (track non-stationary noise)
      this._noiseFloor[k] += (mag[k] * 0.001 - this._noiseFloor[k]) * 0.01;
    }

    ifft(this._re, this._im);
    this._overlapAdd();
  }

  _overlapAdd() {
    // Add windowed IFFT output into output buffer with 50% overlap
    for (let i = 0; i < FFT_SIZE; i++) {
      this._outputBuf[i] += this._re[i] * HANN[i];
    }
  }
}

registerProcessor("noise-suppressor-processor", NoiseSuppressorProcessor);
