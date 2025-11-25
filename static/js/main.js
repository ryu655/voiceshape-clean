class VoiceShapeApp {
    constructor() {
        this.fileId = null;
        this.audio = null;
        this.currentLang = 'ja';
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.subtitles = [];
        this.waveRaf = null;
        this.specRaf = null;
        this.progressTimer = null;
        this.init();
    }

    init() {
        // 言語切り替え
        document.getElementById('langSwitch')?.addEventListener('click', () => {
            this.currentLang = this.currentLang === 'ja' ? 'en' : 'ja';
            document.body.classList.toggle('lang-ja');
            document.body.classList.toggle('lang-en');
            document.getElementById('currentLang').textContent = this.currentLang === 'ja' ? '日本語' : 'English';

            const startBtns = document.querySelectorAll('#startNowBtn, #startNow, #freeBtn');
            startBtns.forEach(btn => btn && (btn.textContent = this.currentLang === 'ja' ? '今すぐ始める' : 'Start Now'));
            const spotBtn = document.getElementById('spotBtn');
            spotBtn && (spotBtn.textContent = this.currentLang === 'ja' ? '購入する' : 'Purchase');
            const proBtn = document.getElementById('proBtn');
            proBtn && (proBtn.textContent = this.currentLang === 'ja' ? '申し込む' : 'Subscribe');
        });

        // 今すぐ始めるボタン
        document.querySelectorAll('#startNowBtn, #startNow, #freeBtn').forEach(btn => {
            btn?.addEventListener('click', () => {
                document.getElementById('uploadSection').scrollIntoView({behavior: 'smooth'});
            });
        });

        // 料金ボタン
        document.getElementById('spotBtn')?.addEventListener('click', () => this.pay('spot'));
        document.getElementById('proBtn')?.addEventListener('click', () => this.pay('pro'));

        // アップロード
        const dropzone = document.getElementById('dropzone');
        const fileInput = document.getElementById('fileInput');
        dropzone?.addEventListener('click', () => fileInput.click());
        fileInput?.addEventListener('change', e => e.target.files[0] && this.upload(e.target.files[0], e.target.files[0].name));

        ['dragover', 'dragenter'].forEach(evt => dropzone?.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add('dragover'); }));
        ['dragleave', 'dragend', 'drop'].forEach(evt => dropzone?.addEventListener(evt, () => dropzone.classList.remove('dragover')));
        dropzone?.addEventListener('drop', e => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            if (e.dataTransfer.files[0]) this.upload(e.dataTransfer.files[0], e.dataTransfer.files[0].name);
        });

        // 下固定プレーヤーのボタン
        document.getElementById('playPauseFixed')?.addEventListener('click', () => this.togglePlay());
        document.getElementById('stopFixed')?.addEventListener('click', () => this.stopAudio());
        document.getElementById('speedSelect')?.addEventListener('change', e => this.audio && (this.audio.playbackRate = parseFloat(e.target.value)));
        document.getElementById('volumeSlider')?.addEventListener('input', e => this.audio && (this.audio.volume = e.target.value));
    }

    async upload(file, filename) {
        this.startProgressTimer();

        document.getElementById('dropzone').innerHTML = `
            <div style="padding:60px 20px; text-align:center; color:#60a5fa;">
                <i class="fas fa-spinner fa-spin fa-3x" style="margin-bottom:20px;"></i>
                <h3>${filename}</h3>
                <p style="color:#94a3b8; margin-top:10px;">解析中...</p>
                <div style="width:80%; max-width:400px; margin:20px auto; background:#334155; border-radius:50px; overflow:hidden;">
                    <div id="progressBar" style="width:0%; height:20px; background:linear-gradient(90deg,#60a5fa,#3b82f6); transition:width 0.6s ease;"></div>
                </div>
                <p style="color:#60a5fa; font-weight:bold;" id="progressText">0%</p>
            </div>`;

        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/upload', {method: 'POST', body: form});
        const data = await res.json();

        if (data.need_payment) {
            this.fileId = data.file_id;
            const ok = confirm("5分を超えています！\n\n【OK】今回だけ500円\n【キャンセル】月980円で無制限");
            this.pay(ok ? "spot" : "pro");
        } else {
            this.fileId = data.file_id;
            this.poll();
        }
    }

    startProgressTimer() {
        if (this.progressTimer) clearInterval(this.progressTimer);
        let p = 0;
        this.progressTimer = setInterval(() => {
            p += Math.random() * 7 + 3;
            if (p >= 95) { p = 95; clearInterval(this.progressTimer); }
            document.getElementById('progressBar').style.width = p + '%';
            document.getElementById('progressText').textContent = Math.round(p) + '%';
        }, 700);
    }

    pay(plan) {
        fetch('/pay', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({plan, file_id: this.fileId})
        }).then(() => this.poll());
    }

    poll() {
        const int = setInterval(async () => {
            const r = await fetch(`/result/${this.fileId}`);
            const d = await r.json();
            if (d.subtitles) {
                clearInterval(int);
                if (this.progressTimer) clearInterval(this.progressTimer);
                setTimeout(() => this.showResult(d), 600);
            }
        }, 2000);
    }

    showResult(data) {
        this.subtitles = data.subtitles;
        const box = document.getElementById('subtitlesDisplay');
        box.innerHTML = '';

        // 字幕全表示（クリックで再生）
        data.subtitles.forEach(item => {
            const div = document.createElement('div');
            div.className = 'subtitle-item';
            div.dataset.start = this.parseTime(item.start);
            div.onclick = () => this.audio && (this.audio.currentTime = div.dataset.start);
            div.innerHTML = `<span class="subtitle-time">${item.start}</span> <span class="subtitle-text">${item.text}</span>`;
            box.appendChild(div);
        });

// 「生成された字幕」の枠線が見えるように、タイトルより少し上にスムーズスクロール
        const subtitleSection = document.querySelector('#resultArea > div > div:last-child');
        if (subtitleSection) {
            subtitleSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // 枠線が完全に表示されるように、少しだけ上に調整
            setTimeout(() => {
                window.scrollBy(0, -90);
            }, 600); // スムーズスクロールの完了を待つ
        }

        // 音声リセット＆再作成（1回目から確実に波形出る！）
        if (this.audio) { this.audio.pause(); this.audio.src = ""; }
        if (this.audioContext) this.audioContext.close();

        this.audio = new Audio(`/static/uploads/${this.fileId}`);
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.source = this.audioContext.createMediaElementSource(this.audio);
        this.source.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);

        this.startWaveform();
        this.startSpectrum();

        // 再生時間更新
        this.audio.addEventListener('timeupdate', () => {
            const current = this.formatTime(this.audio.currentTime);
            const duration = this.formatTime(this.audio.duration || 0);
            document.getElementById('playerTime').textContent = `${current} / ${duration}`;

            const t = this.audio.currentTime;
            document.querySelectorAll('.subtitle-item').forEach(el => {
                const s = parseFloat(el.dataset.start);
                el.classList.toggle('highlight', t >= s && t < s + 5);
            });
        });

        // 下固定プレーヤー登場
        document.getElementById('playerFilename').textContent = this.fileId.split('_').pop();
        document.getElementById('fixedPlayer').style.display = 'block';

        // 結果エリアを3分割で表示
        const resultArea = document.getElementById('resultArea');
        if (resultArea) resultArea.style.display = 'grid';

        // 古いセクション非表示
        document.getElementById('visualizationSection')?.style.setProperty('display', 'none', 'important');
        document.getElementById('subtitlesSection')?.style.setProperty('display', 'none', 'important');

        // ドロップゾーン復元
        document.getElementById('dropzone').innerHTML = `
            <div class="dropzone-content">
                <i class="fas fa-cloud-upload-alt"></i>
                <h3 data-lang="ja">音声ファイルをドラッグ＆ドロップ</h3>
                <h3 data-lang="en" style="display: none;">Drag & Drop Audio File</h3>
                <p data-lang="ja">またはクリックしてファイルを選択</p>
                <p data-lang="en" style="display: none;">Or click to select file</p>
                <small data-lang="ja">対応形式: MP3, WAV, M4A, FLAC (最大500MB)</small>
                <small data-lang="en" style="display: none;">Supported: MP3, WAV, M4A, FLAC (max 500MB)</small>
            </div>
            <input type="file" id="fileInput" accept="audio/*" style="display: none;">`;

        // 結果エリアまでスクロール
        resultArea?.scrollIntoView({behavior: 'smooth'});
    }

    togglePlay() {
        if (!this.audio) return;
        if (this.audio.paused) {
            this.audio.play();
            document.querySelectorAll('#playPauseFixed i').forEach(i => i.className = 'fas fa-pause');
        } else {
            this.audio.pause();
            document.querySelectorAll('#playPauseFixed i').forEach(i => i.className = 'fas fa-play');
        }
    }

    stopAudio() {
        if (!this.audio) return;
        this.audio.pause();
        this.audio.currentTime = 0;
        document.querySelectorAll('#playPauseFixed i').forEach(i => i.className = 'fas fa-play');
        document.querySelectorAll('.subtitle-item').forEach(el => el.classList.remove('highlight'));
    }

    startWaveform() {
        if (this.waveRaf) cancelAnimationFrame(this.waveRaf);
        const canvas = document.getElementById('waveformCanvas');
        const ctx = canvas.getContext('2d');
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            this.waveRaf = requestAnimationFrame(draw);
            this.analyser.getByteTimeDomainData(dataArray);
            ctx.fillStyle = 'rgb(15, 23, 42)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#60a5fa';
            ctx.beginPath();
            const sliceWidth = canvas.width / bufferLength;
            let x = 0;
            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * canvas.height / 2;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                x += sliceWidth;
            }
            ctx.lineTo(canvas.width, canvas.height / 2);
            ctx.stroke();
        };
        draw();
    }

    startSpectrum() {
        if (this.specRaf) cancelAnimationFrame(this.specRaf);
        const canvas = document.getElementById('spectrumCanvas');
        const ctx = canvas.getContext('2d');
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            this.specRaf = requestAnimationFrame(draw);
            this.analyser.getByteFrequencyData(dataArray);
            ctx.fillStyle = 'rgb(15, 23, 42)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            const barWidth = (canvas.width / bufferLength) * 2.5;
            let x = 0;
            for (let i = 0; i < bufferLength; i++) {
                const h = (dataArray[i] / 255) * canvas.height * 0.8;
                const hue = i / bufferLength * 360;
                ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
                ctx.fillRect(x, canvas.height - h, barWidth, h);
                x += barWidth + 1;
            }
        };
        draw();
    }

    parseTime(t) {
        const [h, m, s] = t.split(':').map(parseFloat);
        return h * 3600 + m * 60 + s;
    }

    formatTime(seconds) {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }
}

const app = new VoiceShapeApp();
window.app = app;
