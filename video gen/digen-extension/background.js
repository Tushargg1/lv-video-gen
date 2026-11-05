// Background service worker - uses chrome.debugger for REAL hardware-level mouse/keyboard events

// --- CONFIGURATION ---
// Change this index (0, 1, 2, etc.) to match the Google account you want to use.
// Usually 0 is your default account, 1 is your second account, etc.
const GOOGLE_ACCOUNT_INDEX = 1; 
const GOOGLE_FLOW_URL = `https://flow.google.com/u/${GOOGLE_ACCOUNT_INDEX}/`;
// ---------------------
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const tabId = sender.tab.id;
    const version = '1.3';
    const target = { tabId: tabId };

    if (request.action === 'initDebugger') {
        try {
            chrome.debugger.attach(target, version, () => {
                const err = chrome.runtime.lastError; // clear error
                sendResponse({ success: true });
            });
        } catch (e) {
            sendResponse({ success: true });
        }
        return true;
    }

    if (request.action === 'nativeType') {
        (async () => {
            try {
                await sendCommand(target, 'Debugger.enable', {}).catch(()=>true); // Ignore if already attached
                await new Promise((resolve) => {
                    try {
                        chrome.debugger.attach(target, version, () => {
                            const err = chrome.runtime.lastError;
                            resolve(); 
                        });
                    } catch(e) { resolve(); }
                });

                const { x: tx, y: ty } = request.rect;
                const prompt = request.prompt;

                // Move mouse to textarea
                await sendCommand(target, 'Input.dispatchMouseEvent', {
                    type: 'mouseMoved', x: tx, y: ty, button: 'none', clickCount: 0
                });
                await sleep(100);

                // Triple click to select all
                for (let i = 1; i <= 3; i++) {
                    await sendCommand(target, 'Input.dispatchMouseEvent', {
                        type: 'mousePressed', x: tx, y: ty, button: 'left', clickCount: i
                    });
                    await sendCommand(target, 'Input.dispatchMouseEvent', {
                        type: 'mouseReleased', x: tx, y: ty, button: 'left', clickCount: i
                    });
                    await sleep(40);
                }
                
                await sleep(100);

                // Backspace
                await sendCommand(target, 'Input.dispatchKeyEvent', {
                    type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8
                });
                await sendCommand(target, 'Input.dispatchKeyEvent', {
                    type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8
                });

                await sleep(100);
                // Type text
                if (prompt !== '\\r' && prompt !== '\\n') {
                    for (let i = 0; i < prompt.length; i++) {
                        await sendCommand(target, 'Input.dispatchKeyEvent', {
                            type: 'char', text: prompt[i]
                        });
                        await sleep(10);
                    }
                }
                await sleep(100);
                
                // Press Enter to confirm/save (vital for project names!)
                await sendCommand(target, 'Input.dispatchKeyEvent', {
                    type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13
                });
                await sendCommand(target, 'Input.dispatchKeyEvent', {
                    type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13
                });
                
                sendResponse({ success: true });
            } catch (err) {
                console.error(err);
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }

    if (request.action === 'nativeClick') {
        (async () => {
            try {
                await sendCommand(target, 'Debugger.enable', {}).catch(()=>true); // Ignore if already attached
                await new Promise((resolve) => {
                    try {
                        chrome.debugger.attach(target, version, () => {
                            const err = chrome.runtime.lastError;
                            resolve(); 
                        });
                    } catch(e) { resolve(); }
                });

                const { x: tx, y: ty } = request.rect;

                await sendCommand(target, 'Input.dispatchMouseEvent', {
                    type: 'mouseMoved', x: tx, y: ty, button: 'none', clickCount: 0
                });
                
                await sleep(100);

                await sendCommand(target, 'Input.dispatchMouseEvent', {
                    type: 'mousePressed', x: tx, y: ty, button: request.button || 'left', clickCount: 1
                });

                await sleep(150);

                await sendCommand(target, 'Input.dispatchMouseEvent', {
                    type: 'mouseReleased', x: tx, y: ty, button: request.button || 'left', clickCount: 1
                });

                sendResponse({ success: true });
            } catch (err) {
                console.error(err);
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }

    if (request.action === 'schedule') {
        const { imagePrompt, videoPrompt, autoClick, image, targetTime } = request;
        chrome.storage.local.set({
            scheduledJob: { imagePrompt, videoPrompt, autoClick, image }
        }, () => {
            chrome.alarms.create('digenJob', { when: targetTime });
            sendResponse({ success: true });
        });
        return true;
    }

    if (request.action === 'downloadImage') {
        chrome.downloads.download({
            url: request.url,
            filename: request.filename,
            saveAs: false
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true, downloadId });
            }
        });
        return true;
    }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'digenJob') {
        const result = await chrome.storage.local.get(['scheduledJob']);
        const job = result.scheduledJob;
        if (!job) return;

        chrome.tabs.create({ url: GOOGLE_FLOW_URL }, (tab) => {
            const listener = (tabId, changeInfo) => {
                if (tabId === tab.id && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    
                    // Wait for React to mount
                    setTimeout(() => {
                        chrome.tabs.sendMessage(tab.id, {
                            action: 'fillPrompt',
                            imagePrompt: job.imagePrompt,
                            videoPrompt: job.videoPrompt,
                            autoClick: job.autoClick,
                            image: job.image
                        });
                        chrome.storage.local.remove('scheduledJob');
                    }, 5000); // 5s to be safe
                }
            };
            chrome.tabs.onUpdated.addListener(listener);
        });
    }
});

function sendCommand(target, method, params) {
    return new Promise((resolve, reject) => {
        chrome.debugger.sendCommand(target, method, params, (result) => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve(result);
        });
    });
}

// === AUTOMATIC DASHBOARD INTEGRATION ===
// Poll the local servers (3005 for AI Influencer, 3001 for Affiliate project)
let isPolling = false;
let lastProcessedJobTs = null;
const BRIDGE_PORTS = [3005, 3001];

async function pollForJobs() {
    isPolling = true;
    for (const port of BRIDGE_PORTS) {
        try {
            const res = await fetch(`http://localhost:${port}/api/job`);
            if (res.ok) {
                const data = await res.json();
                if (data.hasJob && data.job) {
                    // Prevent duplicate processing if two polling loops accidentally run
                    if (data.job.timestamp === lastProcessedJobTs) {
                        await fetch(`http://localhost:${port}/api/job`, { method: 'DELETE' });
                    } else {
                        lastProcessedJobTs = data.job.timestamp;
                        console.log(`[BG] Found new job from Port ${port}!`, data.job);
                        const activePort = port;
                        
                        // Clear the job so we don't pick it up twice
                        await fetch(`http://localhost:${activePort}/api/job`, { method: 'DELETE' });

                        // Open flow.google.com and start automation
                        chrome.tabs.create({ url: GOOGLE_FLOW_URL }, (tab) => {
                            let attempts = 0;
                            const trySend = () => {
                                attempts++;
                                chrome.tabs.sendMessage(tab.id, {
                                    action: 'fillPrompt',
                                    imagePrompt: data.job.imagePrompt,
                                    videoPrompt: data.job.videoPrompt,
                                    autoClick: true,
                                    image: data.job.imageBase64
                                }, async (response) => {
                                    if (chrome.runtime.lastError || !response) {
                                        if (attempts < 25) { // Try for up to 50 seconds
                                            setTimeout(trySend, 2000);
                                        } else {
                                            fetch(`http://localhost:${activePort}/api/result`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ success: false, error: 'Extension failed to load on Google Flow after 50 seconds. Make sure you are logged in.' })
                                            }).catch(()=>{});
                                        }
                                        return;
                                    }
                                    
                                    // For VIDEO jobs: wait until the .mp4 is FULLY downloaded before reporting success.
                                    // For IMAGE jobs: report immediately (images download fast as PNG/JPG).
                                    const isVideoJob = !!(data.job.videoPrompt && !data.job.imagePrompt);
                                    
                                    if (isVideoJob && response && response.isNativeDownload) {
                                        console.log('[BG] Video job detected. Waiting for .mp4 download to complete before reporting result...');
                                        
                                        const MAX_WAIT_MS = 10 * 60 * 1000;
                                        // Allow downloads that started up to 60 seconds ago, because content.js clicks download BEFORE it returns!
                                        const listenerRegisteredAt = Date.now() - 60000; 
                                        let completedDownloadPath = null;
                                        
                                        await new Promise((resolve) => {
                                            const listener = (delta) => {
                                                if (delta.state && delta.state.current === 'complete') {
                                                    chrome.downloads.search({ id: delta.id }, (items) => {
                                                        if (items && items[0]) {
                                                            const item = items[0];
                                                            const filename = item.filename || '';
                                                            // Only accept .mp4/.webm that started AFTER we registered the listener
                                                            const downloadStarted = new Date(item.startTime).getTime();
                                                            if ((filename.endsWith('.mp4') || filename.endsWith('.webm')) && downloadStarted >= listenerRegisteredAt) {
                                                                console.log('[BG] ✅ .mp4 download complete:', filename);
                                                                completedDownloadPath = filename;
                                                                chrome.downloads.onChanged.removeListener(listener);
                                                                clearTimeout(fallbackTimer);
                                                                resolve();
                                                            } else if (filename.endsWith('.mp4') || filename.endsWith('.webm')) {
                                                                console.log('[BG] Ignoring old .mp4 (started before job):', filename, 'started:', item.startTime);
                                                            }
                                                        }
                                                    });
                                                }
                                            };
                                            
                                            const fallbackTimer = setTimeout(() => {
                                                console.log('[BG] ⚠️ Timeout waiting for .mp4. Proceeding anyway.');
                                                chrome.downloads.onChanged.removeListener(listener);
                                                resolve();
                                            }, MAX_WAIT_MS);
                                            
                                            chrome.downloads.onChanged.addListener(listener);
                                        });
                                        
                                        console.log('[BG] Posting result to server. File:', completedDownloadPath || 'unknown');
                                        // Pass the exact file path so server.js can serve it directly
                                        if (completedDownloadPath) {
                                            response.completedDownloadPath = completedDownloadPath;
                                        }
                                    }
                                    
                                    // Send the actual result back to the Dashboard Bridge on its respective port
                                    try {
                                        await fetch(`http://localhost:${activePort}/api/result`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify(response)
                                        });
                                    } catch(e) {}
                                    
                                    // CLEANUP: Close the tab so we don't end up with 50 Google Flow tabs open!
                                    // Wait 60 seconds before closing to ensure the image/video has fully started/finished downloading
                                    setTimeout(() => {
                                        try {
                                            chrome.tabs.remove(tab.id);
                                        } catch(e) {
                                            console.log('[BG] Could not close tab:', e);
                                        }
                                    }, 60000);
                                });
                            };
                            
                            // Wait a few seconds for the page to initially load before the first attempt
                            setTimeout(trySend, 4000);
                        });
                        break; // Process one job at a time
                    }
                }
            }
        } catch (e) {
            // Server might be down, ignore
        }
    }
    
    // Poll again in 3 seconds
    setTimeout(pollForJobs, 3000);
}

// Start polling immediately when awake
pollForJobs();

// Wake up the service worker every 20 seconds (minimum Chrome allows)
// This prevents it from going to sleep between polls
chrome.alarms.create("keepAlive", { periodInMinutes: 0.4 }); // ~24s
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "keepAlive") {
        // Restart polling if it somehow stopped
        if (!isPolling) {
            pollForJobs();
        }
        // Touch chrome.storage to prevent service worker from sleeping
        chrome.storage.local.get('keepAlive', () => {
            chrome.storage.local.set({ keepAlive: Date.now() });
        });
    }
});
