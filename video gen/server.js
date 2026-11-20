require('dotenv').config();
const express = require('express');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for images

// Serve the UI page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'ui.html'));
});

let ffmpegPath;
let ffmpeg;
try {
    ffmpegPath = require('ffmpeg-static');
    ffmpeg = require('fluent-ffmpeg');
    ffmpeg.setFfmpegPath(ffmpegPath);
} catch (e) {
    console.warn("fluent-ffmpeg not installed, merge API will not work");
}

let currentJob = null;
let jobResult = null;
let lastExtensionPing = 0;

// In-memory real-time log buffer for live dashboard visibility
const pipelineLogs = [
    { id: 1, time: new Date().toLocaleTimeString(), message: 'Automation bridge server initialized.', level: 'info' }
];

function addPipelineLog(message, level = 'info') {
    const entry = {
        id: Date.now() + Math.random(),
        time: new Date().toLocaleTimeString(),
        message,
        level
    };
    pipelineLogs.push(entry);
    if (pipelineLogs.length > 200) pipelineLogs.shift();
}

app.post('/api/job', (req, res) => {
    const { imagePrompt, videoPrompt, imageBase64, target } = req.body;
    if (!imagePrompt && !videoPrompt) return res.status(400).json({ success: false, error: 'Missing prompts' });
    currentJob = { imagePrompt, videoPrompt, imageBase64, timestamp: Date.now() };
    console.log(`\n📥 Received new ${target === 'image' ? 'Image' : 'Video'} Gen Job from Dashboard!`);
    addPipelineLog(`Queued ${(target === 'image' ? 'Image' : 'Video')} Gen Job for Google Flow: "${(videoPrompt || imagePrompt).slice(0, 75)}..."`, 'action');
    res.json({ success: true, message: 'Job queued for extension!' });
});

app.get('/api/job', (req, res) => {
    lastExtensionPing = Date.now();
    // The extension will poll this every few seconds
    if (currentJob) {
        res.json({ hasJob: true, job: currentJob });
    } else {
        res.json({ hasJob: false });
    }
});

app.delete('/api/job', (req, res) => {
    const hadJob = !!currentJob;
    currentJob = null;
    if (hadJob && req.query.source !== 'cleanup') {
        console.log(`\n✅ Job picked up and cleared by the extension!`);
        addPipelineLog('Browser extension picked up job and started processing on Google Flow!', 'success');
    }
    res.json({ success: true });
});

app.post('/api/result', (req, res) => {
    jobResult = req.body;
    console.log(`\n🎉 Received result from extension:`, JSON.stringify(jobResult));
    if (jobResult.success === false) {
        addPipelineLog(`Extension error: ${jobResult.error || 'Unknown extension error'}`, 'error');
    } else {
        addPipelineLog(`Extension reported completion! Checking Downloads folder for .mp4...`, 'success');
    }
    res.json({ success: true });
});

app.delete('/api/result', (req, res) => {
    jobResult = null;
    res.json({ success: true });
});

app.get('/api/result', (req, res) => {
    if (jobResult) {
        const result = jobResult;
        jobResult = null; // Clear it so we don't return it twice
        res.json({ hasResult: true, result });
    } else {
        res.json({ hasResult: false });
    }
});

app.get('/api/latest-media', (req, res) => {
    try {
        const os = require('os');
        const fs = require('fs');
        const path = require('path');
        const dlPath = path.join(os.homedir(), 'Downloads');
        
        const type = req.query.type || 'video';
        // job_start_time: only accept files strictly NEWER than this timestamp.
        // Defaults to 15 minutes ago as a fallback safety window.
        const jobStartTime = req.query.job_start_time 
            ? parseInt(req.query.job_start_time)
            : Date.now() - 15 * 60 * 1000;
        
        const files = fs.readdirSync(dlPath)
            .filter(f => {
                if (type === 'video') {
                    // STRICTLY only .mp4 or .webm — never a PNG/JPG
                    return f.endsWith('.mp4') || f.endsWith('.webm');
                }
                return f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png') || f.endsWith('.webp');
            })
            .map(f => ({
                name: f,
                time: fs.statSync(path.join(dlPath, f)).mtime.getTime()
            }))
            // Only include files that are NEWER than the job start time
            .filter(f => f.time > jobStartTime)
            .sort((a, b) => b.time - a.time);
            
        if (files.length > 0) {
            const newestFile = files[0];
            const filePath = path.join(dlPath, newestFile.name);
            
            // For video: wait until the file size is stable (not still downloading)
            if (type === 'video') {
                const size1 = fs.statSync(filePath).size;
                // We can't block the event loop, but we can do a quick non-blocking check
                // If size is 0 or very small, it's still downloading
                if (size1 < 50000) { // Less than 50KB means still downloading
                    return res.json({ success: false, error: 'Video file found but still downloading (too small)' });
                }
            }
            
            const fileData = fs.readFileSync(filePath);
            let mimeType = 'video/mp4';
            if (newestFile.name.endsWith('.webm')) mimeType = 'video/webm';
            if (newestFile.name.endsWith('.jpg') || newestFile.name.endsWith('.jpeg')) mimeType = 'image/jpeg';
            if (newestFile.name.endsWith('.png')) mimeType = 'image/png';
            if (newestFile.name.endsWith('.webp')) mimeType = 'image/webp';
            
            const base64 = `data:${mimeType};base64,` + fileData.toString('base64');
            console.log(`\n📁 Serving latest ${type}: ${newestFile.name} (${(fileData.length / 1024 / 1024).toFixed(1)} MB)`);
            return res.json({ success: true, base64: base64, filename: newestFile.name, filepath: filePath });
        }
        res.json({ success: false, error: `No recent ${type} found in Downloads newer than job start time` });
    } catch(e) {
        res.json({ success: false, error: e.message });
    }
});

app.post('/api/merge-video', async (req, res) => {
    let localIntro = null;
    let localBase = null;
    let localOutro = null;
    try {
        const { introVideoUrl, baseVideoUrl, outroVideoUrl } = req.body;
        if (!baseVideoUrl) {
            return res.status(400).json({ error: 'Missing base video URL' });
        }
        if (!introVideoUrl && !outroVideoUrl) {
             return res.status(400).json({ error: 'Missing intro or outro video URL to merge with' });
        }
        
        console.log(`\n🎬 Merging videos locally...`);
        const os = require('os');
        const path = require('path');
        const fs = require('fs');
        
        // Helper to download remote files
        const downloadFile = async (url, prefix) => {
            if (!url.startsWith('http')) return url; // Already local
            console.log(`Downloading ${prefix} video from ${url}...`);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch ${url}`);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const tempPath = path.join(os.tmpdir(), `${prefix}-${Date.now()}.mp4`);
            fs.writeFileSync(tempPath, buffer);
            return tempPath;
        };

        if (introVideoUrl) localIntro = await downloadFile(introVideoUrl, 'intro');
        localBase = await downloadFile(baseVideoUrl, 'base');
        if (outroVideoUrl) localOutro = await downloadFile(outroVideoUrl, 'outro');

        const outputPath = path.join(os.homedir(), 'Downloads', `merged-${Date.now()}.mp4`);
        
        // Use fluent-ffmpeg to merge
        if (!ffmpeg) {
            return res.status(500).json({ error: 'fluent-ffmpeg not available' });
        }
        
        const util = require('util');
        const ffprobe = util.promisify(ffmpeg.ffprobe);
        const ffmpegPath = require('ffmpeg-static');
        const ffprobePath = require('ffprobe-static').path;
        ffmpeg.setFfmpegPath(ffmpegPath);
        ffmpeg.setFfprobePath(ffprobePath);

        const hasAudio = async (filePath) => {
            try {
                const data = await ffprobe(filePath);
                return data.streams.some(s => s.codec_type === 'audio');
            } catch(e) {
                console.error('ffprobe error on', filePath, e.message);
                return false;
            }
        };

        const inputs = [];
        if (localIntro) inputs.push({ path: localIntro, type: 'intro', hasAudio: await hasAudio(localIntro) });
        inputs.push({ path: localBase, type: 'base', hasAudio: await hasAudio(localBase) });
        if (localOutro) inputs.push({ path: localOutro, type: 'outro', hasAudio: await hasAudio(localOutro) });

        const ff = ffmpeg();
        let complexFilter = [];
        let concatFilter = '';

        for (let i = 0; i < inputs.length; i++) {
            ff.input(inputs[i].path);
            // Normalize video
            complexFilter.push(`[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`);
            
            let audioStream;
            if (inputs[i].hasAudio) {
                // Normalize audio to stereo 48000Hz
                complexFilter.push(`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo[a${i}]`);
                audioStream = `[a${i}]`;
            } else {
                // Generate a silent audio stream
                complexFilter.push(`anullsrc=channel_layout=stereo:sample_rate=48000:d=60[silence${i}]`);
                audioStream = `[silence${i}]`;
            }
            concatFilter += `[v${i}]${audioStream}`;
        }
        
        concatFilter += `concat=n=${inputs.length}:v=1:a=1[outv][outa]`;
        complexFilter.push(concatFilter);

        ff.complexFilter(complexFilter)
            .outputOptions([
                '-map [outv]',
                '-map [outa]',
                '-c:v libx264',
                '-preset ultrafast',
                '-c:a aac'
            ])
            .save(outputPath)
            .on('end', () => {
                console.log(`✅ Merge complete! Saved to ${outputPath}`);
                // Cleanup temp files
                if (localIntro && localIntro !== introVideoUrl) fs.unlinkSync(localIntro);
                // Always delete the original base video if we successfully merged
                if (localBase && fs.existsSync(localBase)) fs.unlinkSync(localBase);
                if (localOutro && localOutro !== outroVideoUrl) fs.unlinkSync(localOutro);
                res.json({ success: true, filepath: outputPath });
            })
            .on('error', (err) => {
                console.error(`❌ Merge failed: ${err.message}`);
                if (localIntro && localIntro !== introVideoUrl) fs.unlinkSync(localIntro);
                // On error, do not delete the original base video so it can be uploaded as fallback
                if (localOutro && localOutro !== outroVideoUrl) fs.unlinkSync(localOutro);
                res.status(500).json({ error: err.message });
            });
            
    } catch (e) {
        console.error('Merge API error:', e);
        if (localIntro && localIntro !== req.body.introVideoUrl && require('fs').existsSync(localIntro)) require('fs').unlinkSync(localIntro);
        // On error, don't delete base
        if (localOutro && localOutro !== req.body.outroVideoUrl && require('fs').existsSync(localOutro)) require('fs').unlinkSync(localOutro);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/concat-clips', async (req, res) => {
    try {
        const { clipPaths, outputPath: customOutputPath } = req.body;
        if (!clipPaths || !Array.isArray(clipPaths) || clipPaths.length === 0) {
            return res.status(400).json({ error: 'Missing or invalid clipPaths array' });
        }

        console.log(`\n🎬 Concat API: Merging ${clipPaths.length} clips into a single video...`);
        const os = require('os');
        const path = require('path');
        const fs = require('fs');

        if (!ffmpeg) {
            return res.status(500).json({ error: 'fluent-ffmpeg not available' });
        }

        const util = require('util');
        const ffprobe = util.promisify(ffmpeg.ffprobe);
        const ffmpegPath = require('ffmpeg-static');
        const ffprobePath = require('ffprobe-static').path;
        ffmpeg.setFfmpegPath(ffmpegPath);
        ffmpeg.setFfprobePath(ffprobePath);

        const downloadOrResolve = async (clipPath, idx) => {
            if (!clipPath.startsWith('http')) {
                if (!fs.existsSync(clipPath)) throw new Error(`Clip file not found: ${clipPath}`);
                return clipPath;
            }
            console.log(`Downloading remote clip ${idx + 1} from ${clipPath}...`);
            const response = await fetch(clipPath);
            if (!response.ok) throw new Error(`Failed to fetch ${clipPath}`);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const tempPath = path.join(os.tmpdir(), `clip-${idx}-${Date.now()}.mp4`);
            fs.writeFileSync(tempPath, buffer);
            return tempPath;
        };

        const resolvedClips = [];
        for (let i = 0; i < clipPaths.length; i++) {
            const resolved = await downloadOrResolve(clipPaths[i], i);
            resolvedClips.push(resolved);
        }

        const hasAudio = async (filePath) => {
            try {
                const data = await ffprobe(filePath);
                return data.streams.some(s => s.codec_type === 'audio');
            } catch (e) {
                return false;
            }
        };

        const clipInfos = [];
        for (const cPath of resolvedClips) {
            clipInfos.push({
                path: cPath,
                hasAudio: await hasAudio(cPath)
            });
        }

        const outputPath = customOutputPath || path.join(os.homedir(), 'Downloads', `reel_50s_${Date.now()}.mp4`);

        const ff = ffmpeg();
        const complexFilter = [];
        let concatFilter = '';

        for (let i = 0; i < clipInfos.length; i++) {
            ff.input(clipInfos[i].path);
            complexFilter.push(`[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`);

            let audioStream;
            if (clipInfos[i].hasAudio) {
                complexFilter.push(`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo[a${i}]`);
                audioStream = `[a${i}]`;
            } else {
                complexFilter.push(`anullsrc=channel_layout=stereo:sample_rate=48000:d=15[silence${i}]`);
                audioStream = `[silence${i}]`;
            }
            concatFilter += `[v${i}]${audioStream}`;
        }

        concatFilter += `concat=n=${clipInfos.length}:v=1:a=1[outv][outa]`;
        complexFilter.push(concatFilter);

        ff.complexFilter(complexFilter)
            .outputOptions([
                '-map [outv]',
                '-map [outa]',
                '-c:v libx264',
                '-preset ultrafast',
                '-c:a aac',
                '-b:a 192k'
            ])
            .save(outputPath)
            .on('end', async () => {
                let duration = null;
                try {
                    const probeData = await ffprobe(outputPath);
                    duration = probeData.format.duration;
                } catch (e) {}
                console.log(`✅ Concat complete! Merged ${clipInfos.length} clips into ${outputPath} (${duration ? duration.toFixed(1) + 's' : ''})`);
                res.json({ success: true, filepath: outputPath, duration });
            })
            .on('error', (err) => {
                console.error(`❌ Concat failed: ${err.message}`);
                res.status(500).json({ error: err.message });
            });

    } catch (e) {
        console.error('Concat API error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/upload-local', async (req, res) => {
    try {
        const { filepath } = req.body;
        if (!filepath || !fs.existsSync(filepath)) {
            return res.status(404).json({ error: 'File not found locally' });
        }
        
        console.log(`\n☁️ Uploading to Vercel Blob directly from server: ${filepath}`);
        const data = fs.readFileSync(filepath);
        const { put } = require('@vercel/blob');
        
        let ext = 'png';
        let contentType = 'image/png';
        if (filepath.endsWith('.mp4')) { ext = 'mp4'; contentType = 'video/mp4'; }
        else if (filepath.endsWith('.webm')) { ext = 'webm'; contentType = 'video/webm'; }
        else if (filepath.endsWith('.jpg') || filepath.endsWith('.jpeg')) { ext = 'jpg'; contentType = 'image/jpeg'; }
        else if (filepath.endsWith('.webp')) { ext = 'webp'; contentType = 'image/webp'; }
        
        const blob = await put(`generated-${Date.now()}.${ext}`, data, {
            access: 'public',
            contentType: contentType,
            token: process.env.BLOB_READ_WRITE_TOKEN
        });
        
        console.log(`✅ Upload complete: ${blob.url}`);
        res.json({ url: blob.url });
    } catch(e) {
        console.error('Upload error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/media/:filename', (req, res) => {
    try {
        const os = require('os');
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(os.homedir(), 'Downloads', req.params.filename);
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.status(404).send('Not found');
        }
    } catch(e) {
        res.status(500).send(e.message);
    }
});

app.post('/generate', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required' });

    console.log(`\n🚀 Received generate request for: "${prompt.slice(0, 50)}..."`);
    
    // Use a dedicated automation profile so we NEVER conflict with your main Edge browser (Fixes Error 32 Lock file)
    const USER_DATA = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'DigenAutomationProfile');
    let browser;
    let context;
    let isCDP = false;
    
    try {
        console.log('Attempting to connect to running Edge (port 9222)...');
        try {
            browser = await chromium.connectOverCDP('http://localhost:9222');
            context = browser.contexts()[0];
            isCDP = true;
            console.log('✅ Connected to existing Edge instance via CDP!');
        } catch (cdpErr) {
            console.log('No CDP instance found. Trying to launch persistent context...');
            context = await chromium.launchPersistentContext(USER_DATA, {
                headless: false,
                channel: 'msedge',
                args: ['--no-first-run', '--no-default-browser-check'],
                slowMo: 300,
                viewport: null
            });
        }

        let page;
        if (isCDP) {
            // Find existing Digen AI tab or create a new one
            const pages = context.pages();
            page = pages.find(p => p.url().includes('digen.ai'));
            if (page) {
                await page.bringToFront();
            } else {
                page = await context.newPage();
            }
        } else {
            page = await context.newPage();
        }

        console.log('Navigating to digen.ai/create...');
        if (!page.url().includes('digen.ai/create')) {
            await page.goto('https://digen.ai/create', { waitUntil: 'domcontentloaded', timeout: 30000 });
        }
        await page.waitForTimeout(5000);

        // Find buttons
        const buttons = await page.evaluate(() => {
            const els = Array.from(document.querySelectorAll('button, [role="button"]'));
            return els.map((el, i) => {
                const rect = el.getBoundingClientRect();
                return {
                    text: el.textContent.trim().slice(0, 100),
                    disabled: el.disabled || el.getAttribute('disabled') !== null,
                    visible: rect.width > 0 && rect.height > 0,
                    x: Math.round(rect.x + rect.width / 2),
                    y: Math.round(rect.y + rect.height / 2)
                };
            });
        });

        const generateBtn = buttons.find(b => b.visible && !b.disabled && b.text.toLowerCase().includes('generate'));
        
        if (generateBtn) {
            console.log('✅ Found generate button');

            // Fill the textarea
            const textarea = await page.$('textarea');
            if (textarea) {
                console.log('⌨️  Filling prompt using mouse and keyboard...');
                // Click to focus and select all (clickCount: 3 selects the paragraph, but in textarea often selects all)
                await textarea.click({ clickCount: 3 });
                await page.keyboard.press('Backspace'); // clear existing
                await textarea.fill(prompt);
                await page.waitForTimeout(1000);
            } else {
                throw new Error("Could not find textarea to enter prompt");
            }

            // Click generate button using native mouse move and click
            console.log('🎯 Moving mouse to Generate button and clicking...');
            await page.mouse.move(generateBtn.x, generateBtn.y, { steps: 10 });
            await page.waitForTimeout(500);
            await page.mouse.click(generateBtn.x, generateBtn.y);
            
            console.log('✅ Clicked generate!');
            
            // Wait to let generation start
            await page.waitForTimeout(5000);
            
            if (!isCDP) await context.close();
            else if (browser) await browser.disconnect();
            
            return res.json({ success: true, message: 'Automation complete' });
        } else {
            if (!isCDP) await context.close();
            else if (browser) await browser.disconnect();
            return res.status(400).json({ success: false, error: 'Could not find the Generate button on the page' });
        }

    } catch (e) {
        console.error('Error during automation:', e);
        if (!isCDP && context) await context.close();
        else if (isCDP && browser) await browser.disconnect();
        return res.status(500).json({ success: false, error: e.message });
    }
});

// === AI INFLUENCER REEL ENDPOINTS ===
let isInfluencerPipelineRunning = false;
let influencerPipelineStatus = { status: 'idle', message: 'Ready' };

app.get('/api/influencer/config', (req, res) => {
    try {
        const configPath = path.join(__dirname, 'influencer_config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (!config.reference_image_base64 && config.reference_image_path && fs.existsSync(config.reference_image_path)) {
                try {
                    const ext = path.extname(config.reference_image_path).replace('.', '') || 'jpeg';
                    config.reference_image_base64 = `data:image/${ext};base64,` + fs.readFileSync(config.reference_image_path, 'base64');
                } catch (e) {}
            }
            config.has_groq_key = !!(process.env.GROQ_API_KEY || config.groq_api_key);
            config.groq_api_key = config.groq_api_key || process.env.GROQ_API_KEY || '';
            return res.json({ success: true, config });
        }
        res.status(404).json({ success: false, error: 'Config file not found' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/influencer/config', (req, res) => {
    try {
        const configPath = path.join(__dirname, 'influencer_config.json');
        let config = {};
        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
        const { 
            daily_post_time, 
            platforms, 
            influencer_name, 
            niche, 
            character_prompt, 
            reference_image_base64,
            remove_reference_image,
            groq_api_key 
        } = req.body || {};

        if (daily_post_time) config.daily_post_time = daily_post_time;
        if (platforms) config.platforms = platforms;
        if (influencer_name) config.influencer_name = influencer_name;
        if (niche) config.niche = niche;
        if (character_prompt !== undefined) config.character_prompt = character_prompt;

        if (groq_api_key !== undefined) {
            config.groq_api_key = groq_api_key.trim();
            process.env.GROQ_API_KEY = groq_api_key.trim();
            try {
                const envPath = path.join(__dirname, '.env');
                let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
                if (envContent.includes('GROQ_API_KEY=')) {
                    envContent = envContent.replace(/GROQ_API_KEY=.*/g, `GROQ_API_KEY="${groq_api_key.trim()}"`);
                } else {
                    envContent += `\nGROQ_API_KEY="${groq_api_key.trim()}"\n`;
                }
                fs.writeFileSync(envPath, envContent, 'utf8');
                // Also update root .env
                const rootEnvPath = path.join(__dirname, '..', '.env');
                if (fs.existsSync(rootEnvPath)) fs.writeFileSync(rootEnvPath, envContent, 'utf8');
            } catch (e) {}
            console.log('[Influencer] Groq API Key updated.');
        }

        if (remove_reference_image) {
            config.reference_image_base64 = '';
            config.reference_image_path = '';
            const imgPath = path.join(__dirname, 'data', 'reference_model.jpg');
            if (fs.existsSync(imgPath)) try { fs.unlinkSync(imgPath); } catch (e) {}
            console.log('[Influencer] Reference image removed.');
        } else if (reference_image_base64) {
            const dataDir = path.join(__dirname, 'data');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            const imgPath = path.join(dataDir, 'reference_model.jpg');
            const cleanBase64 = reference_image_base64.replace(/^data:image\/\w+;base64,/, '');
            fs.writeFileSync(imgPath, Buffer.from(cleanBase64, 'base64'));
            config.reference_image_path = imgPath;
            config.reference_image_base64 = reference_image_base64;
            console.log('[Influencer] Reference model photo updated and saved.');
        }

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        console.log(`[Influencer] Config updated. Daily post time: ${config.daily_post_time}`);
        res.json({ success: true, message: 'Config updated successfully', config });
    } catch (err) {
        console.error('[Influencer] Error saving config:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/influencer/status', (req, res) => {
    const now = Date.now();
    const isExtensionActive = lastExtensionPing > 0 && (now - lastExtensionPing) < 15000;
    const lastPingSecondsAgo = lastExtensionPing > 0 ? Math.round((now - lastExtensionPing) / 1000) : null;

    let latestPlan = null;
    const todayStr = new Date().toISOString().split('T')[0];
    const reelDir = path.join(__dirname, 'data', 'influencer_reels', `reel_${todayStr}`);
    try {
        const planFile = path.join(reelDir, 'plan.json');
        if (fs.existsSync(planFile)) {
            latestPlan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
        }
    } catch (e) {}

    const completedClips = [];
    try {
        for (let c = 1; c <= 5; c++) {
            const cPath = path.join(reelDir, `clip_${c}.mp4`);
            if (fs.existsSync(cPath) && fs.statSync(cPath).size > 50000) {
                completedClips.push(c);
            }
        }
    } catch (e) {}
    const finalReelPath = path.join(reelDir, `final_reel_50s_${todayStr}.mp4`);
    const hasFinalReel = fs.existsSync(finalReelPath);

    res.json({
        isRunning: isInfluencerPipelineRunning,
        status: influencerPipelineStatus,
        extension: {
            isActive: isExtensionActive,
            lastPingSecondsAgo,
            lastPingTime: lastExtensionPing ? new Date(lastExtensionPing).toLocaleTimeString() : null
        },
        plan: latestPlan,
        completedClips,
        hasFinalReel,
        logs: pipelineLogs.slice(-60)
    });
});

app.get('/api/influencer/logs', (req, res) => {
    res.json({ success: true, logs: pipelineLogs });
});

app.post('/api/influencer/reset', (req, res) => {
    isInfluencerPipelineRunning = false;
    currentJob = null;
    jobResult = null;
    influencerPipelineStatus = { status: 'idle', message: 'Pipeline stopped by user.' };
    addPipelineLog('⏹ Pipeline stopped by user. Preserving saved clips and storyboard.', 'warn');
    try {
        const { cancelPipeline } = require('./influencer_pipeline');
        cancelPipeline();
    } catch (e) {}
    console.log('[Influencer] Pipeline stopped & reset to idle by user.');
    res.json({ success: true, message: 'Influencer pipeline stopped and reset to idle' });
});

app.post('/api/influencer/discard-plan', (req, res) => {
    try {
        const { removeReferenceImage = true } = req.body || {};
        
        // 1. Stop any running pipeline and clear pending extension jobs
        isInfluencerPipelineRunning = false;
        currentJob = null;
        jobResult = null;
        influencerPipelineStatus = { status: 'idle', message: 'Clip idea and storyboard discarded.' };
        try {
            const { cancelPipeline } = require('./influencer_pipeline');
            cancelPipeline();
        } catch (e) {}

        // 2. Clear today's saved plan and any partially generated clips from disk
        const todayStr = new Date().toISOString().split('T')[0];
        const reelDir = path.join(__dirname, 'data', 'influencer_reels', `reel_${todayStr}`);
        if (fs.existsSync(reelDir)) {
            const files = fs.readdirSync(reelDir);
            for (const file of files) {
                try {
                    fs.unlinkSync(path.join(reelDir, file));
                } catch (e) {}
            }
            try {
                fs.rmdirSync(reelDir);
            } catch (e) {}
            console.log(`[Influencer] Deleted reel folder and all clip files: ${reelDir}`);
        }

        // 3. Remove user reference image if requested
        if (removeReferenceImage) {
            const configPath = path.join(__dirname, 'influencer_config.json');
            if (fs.existsSync(configPath)) {
                try {
                    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    config.reference_image_base64 = '';
                    config.reference_image_path = '';
                    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
                } catch (e) {}
            }
            const imgPath = path.join(__dirname, 'data', 'reference_model.jpg');
            if (fs.existsSync(imgPath)) {
                try { fs.unlinkSync(imgPath); } catch (e) {}
            }
            console.log('[Influencer] Reference model photo removed on clip idea discard.');
        }

        addPipelineLog('🗑️ Clip idea discarded: All 5 scene prompts, downloaded clips, topic prompt, and reference image removed.', 'warn');
        console.log('[Influencer] Clip idea and all associated data completely discarded by user.');
        res.json({ success: true, message: 'Clip idea and all associated prompts, clips, and image completely removed.' });
    } catch (err) {
        console.error('[Influencer] Error discarding clip idea:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/influencer/run', (req, res) => {
    if (isInfluencerPipelineRunning) {
        return res.status(409).json({ success: false, message: 'Influencer pipeline is already running!' });
    }
    const { customTopic, forceNewPlan } = req.body || {};
    isInfluencerPipelineRunning = true;
    influencerPipelineStatus = { 
        status: 'running', 
        message: forceNewPlan ? 'Planning brand new 50s reel script with Groq 120B Flagship...' : 'Starting reel pipeline from saved storyboard...',
        customTopic: customTopic || 'Autonomous Daily Theme',
        currentClip: 0,
        totalClips: 5,
        updatedAt: new Date().toLocaleTimeString()
    };
    addPipelineLog(forceNewPlan ? `🚀 Generating brand new 50s reel storyboard: "${customTopic || 'Daily Theme'}"` : `🚀 Running reel pipeline from saved storyboard...`, 'action');

    res.json({ success: true, message: '50-second reel generation pipeline started!' });

    // Run asynchronously
    const { runDailyInfluencerPipeline } = require('./influencer_pipeline');
    runDailyInfluencerPipeline({ 
        customTopic,
        forceNewPlan: !!forceNewPlan,
        onStatusUpdate: (update) => {
            influencerPipelineStatus = {
                status: 'running',
                ...influencerPipelineStatus,
                ...update,
                updatedAt: new Date().toLocaleTimeString()
            };
            if (update.message) {
                addPipelineLog(update.message, update.step || 'info');
            }
        }
    })
        .then(result => {
            isInfluencerPipelineRunning = false;
            influencerPipelineStatus = { status: 'completed', message: '50s Reel ready and scheduled!', result, updatedAt: new Date().toLocaleTimeString() };
            addPipelineLog(`🎉 50s Reel completely generated, merged and scheduled!`, 'success');
            console.log(`\n🎉 Influencer pipeline completed via API trigger!`);
        })
        .catch(err => {
            isInfluencerPipelineRunning = false;
            influencerPipelineStatus = { status: 'error', message: err.message, updatedAt: new Date().toLocaleTimeString() };
            addPipelineLog(`❌ Pipeline error: ${err.message}`, 'error');
            console.error(`\n❌ Influencer pipeline error via API trigger:`, err);
        });
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
    console.log(`\n==============================================`);
    console.log(`🌟 Local Automation Bridge running on http://localhost:${PORT}`);
});

// Dual-Port Bridge: If Port 3001 is free, also handle requests on Port 3001
// This guarantees instant compatibility with extensions configured on either Port 3005 or Port 3001!
if (PORT != 3001) {
    const http = require('http');
    const proxyServer = http.createServer((req, res) => {
        app(req, res);
    });
    proxyServer.on('error', (err) => {
        console.log(`[Bridge] Port 3001 note (${err.code}). Running on primary port ${PORT}.`);
    });
    proxyServer.listen(3001, () => {
        console.log(`🌟 Dual-port active: Also listening on http://localhost:3001 for browser extension compatibility!`);
        console.log(`==============================================\n`);
    });
}
