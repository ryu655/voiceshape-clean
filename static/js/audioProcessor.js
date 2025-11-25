// VoiceShape.jp - Audio Processing Module

class AudioProcessor {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.analyser = null;
        this.dataArray = null;
        this.bufferLength = null;
        this.setupAnalyser();
    }

    setupAnalyser() {
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);
    }

    processAudioBuffer(audioBuffer) {
        // Create audio source from buffer
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.analyser);
        
        return source;
    }

    getWaveformData() {
        if (!this.analyser || !this.dataArray) return null;
        
        this.analyser.getByteTimeDomainData(this.dataArray);
        return Array.from(this.dataArray);
    }

    getSpectrumData() {
        if (!this.analyser || !this.dataArray) return null;
        
        this.analyser.getByteFrequencyData(this.dataArray);
        return Array.from(this.dataArray);
    }

    getAudioFeatures() {
        const waveformData = this.getWaveformData();
        const spectrumData = this.getSpectrumData();
        
        if (!waveformData || !spectrumData) return null;

        // Calculate audio features
        const features = {
            rms: this.calculateRMS(waveformData),
            peak: this.calculatePeak(waveformData),
            spectralCentroid: this.calculateSpectralCentroid(spectrumData),
            zeroCrossingRate: this.calculateZeroCrossingRate(waveformData),
            spectralRolloff: this.calculateSpectralRolloff(spectrumData),
            energy: this.calculateEnergy(spectrumData)
        };

        return features;
    }

    calculateRMS(data) {
        const sum = data.reduce((acc, val) => acc + Math.pow(val - 128, 2), 0);
        return Math.sqrt(sum / data.length) / 128;
    }

    calculatePeak(data) {
        return Math.max(...data.map(val => Math.abs(val - 128))) / 128;
    }

    calculateSpectralCentroid(spectrumData) {
        const sampleRate = this.audioContext.sampleRate;
        const nyquist = sampleRate / 2;
        
        let numerator = 0;
        let denominator = 0;
        
        for (let i = 0; i < spectrumData.length; i++) {
            const frequency = (i / spectrumData.length) * nyquist;
            numerator += frequency * spectrumData[i];
            denominator += spectrumData[i];
        }
        
        return denominator === 0 ? 0 : numerator / denominator;
    }

    calculateZeroCrossingRate(data) {
        let crossings = 0;
        for (let i = 1; i < data.length; i++) {
            if ((data[i] - 128) * (data[i-1] - 128) < 0) {
                crossings++;
            }
        }
        return crossings / data.length;
    }

    calculateSpectralRolloff(spectrumData, threshold = 0.85) {
        const totalEnergy = spectrumData.reduce((sum, val) => sum + val, 0);
        const targetEnergy = totalEnergy * threshold;
        
        let cumulativeEnergy = 0;
        for (let i = 0; i < spectrumData.length; i++) {
            cumulativeEnergy += spectrumData[i];
            if (cumulativeEnergy >= targetEnergy) {
                return (i / spectrumData.length) * (this.audioContext.sampleRate / 2);
            }
        }
        
        return this.audioContext.sampleRate / 2;
    }

    calculateEnergy(spectrumData) {
        return spectrumData.reduce((sum, val) => sum + val * val, 0) / spectrumData.length;
    }

    detectSilence(data, threshold = 0.01) {
        const rms = this.calculateRMS(data);
        return rms < threshold;
    }

    detectVoicing(data, spectrumData) {
        const zeroCrossingRate = this.calculateZeroCrossingRate(data);
        const spectralCentroid = this.calculateSpectralCentroid(spectrumData);
        
        // Simple voicing detection based on zero crossing rate and spectral centroid
        const isVoiced = zeroCrossingRate < 0.15 && spectralCentroid < 2000;
        return isVoiced;
    }

    extractPitch(data, sampleRate = 44100) {
        // Simple autocorrelation-based pitch detection
        const minPeriod = Math.floor(sampleRate / 500); // 500 Hz max
        const maxPeriod = Math.floor(sampleRate / 50);  // 50 Hz min
        
        let bestPeriod = 0;
        let maxCorrelation = 0;
        
        for (let period = minPeriod; period <= maxPeriod; period++) {
            let correlation = 0;
            for (let i = 0; i < data.length - period; i++) {
                correlation += data[i] * data[i + period];
            }
            
            if (correlation > maxCorrelation) {
                maxCorrelation = correlation;
                bestPeriod = period;
            }
        }
        
        return bestPeriod > 0 ? sampleRate / bestPeriod : 0;
    }

    applyNoiseGate(data, threshold = 0.02, ratio = 10) {
        const rms = this.calculateRMS(data);
        
        if (rms < threshold) {
            // Apply noise gate
            return data.map(val => {
                const difference = val - 128;
                const gated = difference / ratio;
                return Math.max(-128, Math.min(127, gated + 128));
            });
        }
        
        return data;
    }

    applyCompression(data, threshold = 0.5, ratio = 4, attack = 0.001, release = 0.1) {
        const rms = this.calculateRMS(data);
        
        if (rms > threshold) {
            const gainReduction = (rms - threshold) * (1 - 1/ratio);
            const compressedGain = 1 - gainReduction;
            
            return data.map(val => {
                const difference = val - 128;
                const compressed = difference * compressedGain;
                return Math.max(-128, Math.min(127, compressed + 128));
            });
        }
        
        return data;
    }

    normalizeAudio(data, targetRMS = 0.3) {
        const currentRMS = this.calculateRMS(data);
        
        if (currentRMS > 0) {
            const gain = targetRMS / currentRMS;
            
            return data.map(val => {
                const difference = val - 128;
                const normalized = difference * gain;
                return Math.max(-128, Math.min(127, normalized + 128));
            });
        }
        
        return data;
    }

    getAudioStats(data) {
        const sorted = [...data].sort((a, b) => a - b);
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
        const median = sorted[Math.floor(sorted.length / 2)];
        
        // Calculate standard deviation
        const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
        const stdDev = Math.sqrt(variance);
        
        return {
            min,
            max,
            mean,
            median,
            stdDev,
            range: max - min,
            dynamicRange: 20 * Math.log10(Math.max(...data) / Math.max(1, Math.min(...data)))
        };
    }

    createAudioVisualization(canvas, type = 'waveform') {
        if (!canvas) return null;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        const draw = (data) => {
            ctx.clearRect(0, 0, width, height);
            
            if (type === 'waveform') {
                this.drawWaveform(ctx, data, width, height);
            } else if (type === 'spectrum') {
                this.drawSpectrum(ctx, data, width, height);
            }
        };
        
        return draw;
    }

    drawWaveform(ctx, data, width, height) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#2563eb';
        ctx.beginPath();
        
        const sliceWidth = width / data.length;
        let x = 0;
        
        for (let i = 0; i < data.length; i++) {
            const v = data[i] / 128.0;
            const y = v * height / 2;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            
            x += sliceWidth;
        }
        
        ctx.stroke();
    }

    drawSpectrum(ctx, data, width, height) {
        const barWidth = width / data.length;
        let x = 0;
        
        for (let i = 0; i < data.length; i++) {
            const barHeight = (data[i] / 255) * height;
            
            const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
            gradient.addColorStop(0, '#3b82f6');
            gradient.addColorStop(1, '#1d4ed8');
            
            ctx.fillStyle = gradient;
            ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
            
            x += barWidth;
        }
    }
}

// Export for use in main.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioProcessor;
} else {
    window.AudioProcessor = AudioProcessor;
}