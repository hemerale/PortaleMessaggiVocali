/* -------------------------------
        CONFIGURAZIONE
--------------------------------*/

// EmailJS
const EMAILJS_PUBLIC_KEY = "";
const EMAILJS_SERVICE_ID = "";
const EMAILJS_TEMPLATE_ID = "";

// Cloudinary
const CLOUDINARY_CLOUD_NAME = "";
const CLOUDINARY_UPLOAD_PRESET = "";

emailjs.init(EMAILJS_PUBLIC_KEY);

/* -------------------------------
        ELEMENTI UI
--------------------------------*/
const startBtn = document.getElementById('start');
const stopBtn  = document.getElementById('stop');
const sendBtn  = document.getElementById('send');
const player   = document.getElementById('player');
const statusEl = document.getElementById('status');
const timerEl  = document.getElementById('timer');
const canvas   = document.getElementById('wave');
const ctx      = canvas.getContext('2d');

/* -------------------------------
        VARIABILI DI STATO
--------------------------------*/
let stream = null;
let mediaRecorder = null;
let audioChunks = [];
let audioBlob = null;
let uploadedURL = "";
let canSend = false;
let seconds = 0;
let timerInterval = null;
let analyser = null;
let animationId = null;

/* -------------------------------
        FUNZIONI AUSILIARIE
--------------------------------*/
function resetCanvas(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#f8f8fa';
    ctx.fillRect(0,0,canvas.width,canvas.height);
}

function drawWaveform(){
    if(!analyser) return;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);
    
    ctx.fillStyle = '#f8f8fa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const barWidth = (canvas.width / bufferLength) * 2.5;
    let barHeight;
    let x = 0;
    
    ctx.fillStyle = '#6a5aaa';
    
    for(let i = 0; i < bufferLength; i++){
        barHeight = (dataArray[i] / 255) * (canvas.height * 0.8);
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
        x += barWidth;
    }
    
    animationId = requestAnimationFrame(drawWaveform);
}

function stopWaveformAnimation(){
    if(animationId){
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}

function resizeCanvas(){
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * devicePixelRatio);
    canvas.height = Math.floor(rect.height * devicePixelRatio);
    ctx.scale(devicePixelRatio, devicePixelRatio);
    resetCanvas();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function startTimer(){
    clearInterval(timerInterval);
    seconds = 0;
    timerInterval = setInterval(() => {
        seconds++;
        const m = String(Math.floor(seconds/60)).padStart(2,'0');
        const s = String(seconds % 60).padStart(2,'0');
        timerEl.textContent = `${m}:${s}`;
    },1000);
}

function stopTimer(){ clearInterval(timerInterval); }

function resetRecordingState(){
    if(mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if(stream) stream.getTracks().forEach(t => t.stop());
    audioChunks = [];
    audioBlob = null;
    uploadedURL = "";
    canSend = false;
    player.src = "";
    player.style.display = 'none';
    startBtn.disabled = false;
    stopBtn.disabled = true;
    sendBtn.disabled = true;
    startBtn.textContent = '🎙️ Registra';
    timerEl.textContent = '00:00';
    resetCanvas();
}

window.addEventListener('beforeunload', resetRecordingState);

/* -------------------------------
        BUTTON EVENTS
--------------------------------*/
startBtn.addEventListener('click', async () => {
    resetRecordingState();

    try{
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }catch(err){
        console.error(err);
        statusEl.textContent = '❌ Permesso microfono negato o errore: ' + err.message;
        statusEl.classList.remove('status-hidden');
        return;
    }

    // Setup audio analyser for waveform
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    source.connect(analyser);
    analyser.fftSize = 256;

    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = e => {
        if(e.data && e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstart = () => {
        statusEl.textContent = '🎙️ Registrazione in corso...';
        statusEl.classList.remove('status-hidden');
        startBtn.disabled = true;
        stopBtn.disabled = false;
        sendBtn.disabled = true;
        player.style.display = 'none';
        startTimer();
        drawWaveform();
    };

    mediaRecorder.onstop = async () => {
        stopTimer();
        stopWaveformAnimation();
        audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        player.src = url;
        player.load();
        player.style.display = 'block';
        statusEl.textContent = '⏳ Upload sul Cloud...';
        statusEl.classList.remove('status-hidden');

        try{
            const formData = new FormData();
            formData.append('file', audioBlob, 'messaggio.webm');
            formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

            const resp = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/raw/upload`, {
                method: 'POST',
                body: formData
            });

            if(!resp.ok) throw new Error('Upload fallito');
            const data = await resp.json();
            uploadedURL = data.secure_url || data.url;
            statusEl.textContent = '✅ Caricato. Pronto per inviare.';
            sendBtn.disabled = false;
            canSend = true;
            startBtn.disabled = false;
        }catch(err){
            console.error(err);
            statusEl.textContent = '❌ Errore upload';
            sendBtn.disabled = true;
            canSend = false;
        }finally{
            if(stream) stream.getTracks().forEach(t => t.stop());
        }
    };

    mediaRecorder.start();
});

stopBtn.addEventListener('click', () => {
    if(mediaRecorder && mediaRecorder.state !== 'inactive'){
        mediaRecorder.stop();
        stopBtn.disabled = true;
        stopWaveformAnimation();
    }
});

sendBtn.addEventListener('click', async () => {
    if(!canSend){
        statusEl.textContent = '📌 Devi registrare prima di inviare';
        statusEl.classList.remove('status-hidden');
        return;
    }

    statusEl.textContent = '📤 Invio email...';
    statusEl.classList.remove('status-hidden');
    sendBtn.disabled = true;

    try{
        await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
            message: 'Hai ricevuto un messaggio vocale!',
            audio_link: uploadedURL
        });

        statusEl.textContent = '✅ Email inviata!';
        canSend = false;

        // Reset locale post invio
        audioBlob = null;
        uploadedURL = "";
        player.src = "";
        player.style.display = 'none';
        player.load();
        startBtn.disabled = false;
        stopBtn.disabled = true;
        sendBtn.disabled = true;
        timerEl.textContent = '00:00';
        resetCanvas();
        
        // Nascondi status dopo 3 secondi
        setTimeout(() => {
            statusEl.classList.add('status-hidden');
        }, 3000);
    }catch(err){
        console.error(err);
        statusEl.textContent = '❌ Errore invio';
        sendBtn.disabled = false;
    }
});

