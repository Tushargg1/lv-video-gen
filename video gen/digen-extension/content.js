// Digen AI Automation - content.js
console.log('🎬 Digen AI Extension loaded (Native Mouse Edition)');

// Inject floating widget on page
function injectFloatingWidget() {
    if (document.getElementById('digen-auto-widget')) return;

    const widget = document.createElement('div');
    widget.id = 'digen-auto-widget';
    widget.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        z-index: 9999999;
        background: #18181b;
        border: 1px solid #3f3f46;
        box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        border-radius: 12px;
        padding: 12px 16px;
        font-family: system-ui, -apple-system, sans-serif;
        color: #fff;
        display: flex;
        flex-direction: column;
        gap: 8px;
    `;
    widget.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:18px">🤖</span>
            <span style="font-size:13px;font-weight:600;color:#a1a1aa" id="digen-status-text">Auto Gen v1.6: Ready</span>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
            <input type="checkbox" id="digen-cb-settings" checked style="cursor:pointer;" title="Apply project settings?">
            <button id="digen-btn-full" style="background:linear-gradient(135deg,#8b5cf6,#6366f1);color:#fff;border:none;border-radius:6px;padding:6px 10px;font-size:11px;font-weight:600;cursor:pointer;">1. Full Flow</button>
            <button id="digen-btn-dl" style="background:#3f3f46;color:#fff;border:1px solid #52525b;border-radius:6px;padding:6px 10px;font-size:11px;font-weight:600;cursor:pointer;">2. Download</button>
            <button id="digen-btn-vid" style="background:#3f3f46;color:#fff;border:1px solid #52525b;border-radius:6px;padding:6px 10px;font-size:11px;font-weight:600;cursor:pointer;">3. Vid Prompt</button>
        </div>
    `;
    document.body.appendChild(widget);

    const runTrigger = async (step, btnId) => {
        const btn = document.getElementById(btnId);
        btn.disabled = true;
        btn.style.opacity = '0.5';
        
        let imgPrompt = localStorage.getItem('digen-last-img') || 'A cute robot toy standing in a neon-lit room, high quality 3D render';
        let vidPrompt = localStorage.getItem('digen-last-vid') || 'Walking and dancing, colorful LED lights flashing, smooth animation, playful movements, 4K quality';
        
        const applySettings = document.getElementById('digen-cb-settings').checked;
        await triggerNativeAutomation(imgPrompt, vidPrompt, true, null, step, applySettings);
        
        btn.disabled = false;
        btn.style.opacity = '1';
        document.getElementById('digen-status-text').textContent = '✅ Finished';
    };

    document.getElementById('digen-btn-full').addEventListener('click', () => runTrigger(1, 'digen-btn-full'));
    document.getElementById('digen-btn-dl').addEventListener('click', () => runTrigger(2, 'digen-btn-dl'));
    document.getElementById('digen-btn-vid').addEventListener('click', () => runTrigger(3, 'digen-btn-vid'));
}

setTimeout(injectFloatingWidget, 2000);

// Listen for popup messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fillPrompt') {
        triggerNativeAutomation(request.imagePrompt, request.videoPrompt, request.autoClick, request.image, request.startStep)
            .then(res => sendResponse(res))
            .catch(e => sendResponse({ success: false, error: e.message }));
        return true;
    }
});

function getCenter(el) {
    const rect = el.getBoundingClientRect();
    return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2)
    };
}

async function triggerNativeAutomation(imgPrompt, vidPrompt, autoClick, imageBase64, startStep = 1, applySettings = true) {
    if (window.location.hostname.includes('flow.google.com')) {
        return await runGoogleFlow(imgPrompt, vidPrompt, imageBase64, startStep, applySettings);
    } else {
        return await runDigenAI(imgPrompt, autoClick, imageBase64);
    }
}

function updateWidgetStatus(msg, isError = false) {
    const statusText = document.getElementById('digen-status-text');
    if (statusText) {
        // Extract just the core message without emojis if it's too long
        let text = msg.replace(/[^\x00-\x7F]/g, "").trim(); 
        if (text.length > 40) text = text.substring(0, 40) + '...';
        statusText.textContent = (isError ? '❌ ' : '⏳ ') + text;
        statusText.style.color = isError ? '#ef4444' : '#a1a1aa';
    }
}

// === GOOGLE FLOW AUTOMATION ===
async function runGoogleFlow(imgPrompt, vidPrompt, imageBase64, startStep = 1, applySettings = true) {
    updateWidgetStatus('Starting...');

    // 0. Initialize debugger to force the banner to appear and layout to settle!
    chrome.runtime.sendMessage({ action: 'initDebugger' }, () => {
        // Ignore response
    });
    await sleep(1000); // CRITICAL: wait for the top banner to push the page down!

    // Helper to send native clicks
    const nClick = async (el) => {
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        await sleep(300);
        highlightElement(el);
        
        await new Promise(r => chrome.runtime.sendMessage({ action: 'nativeClick', rect: getCenter(el) }, r));
        await sleep(1000);
    };

    // Helper to send native typing
    const nType = async (el, text) => {
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        await sleep(300);
        highlightElement(el);
        
        // We MUST physically click the textarea to focus it, otherwise typing goes into the void!
        await new Promise(r => chrome.runtime.sendMessage({ action: 'nativeClick', rect: getCenter(el) }, r));
        await sleep(300);
        
        // Use native debugger typing
        await new Promise(r => chrome.runtime.sendMessage({ action: 'nativeType', prompt: text, rect: getCenter(el) }, r));
        
        // Wait and press Enter natively!
        await sleep(500);
        await new Promise(r => chrome.runtime.sendMessage({ action: 'nativeType', prompt: '\\r', rect: getCenter(el) }, r));
        await sleep(500);
    };

    // Helper for right clicks
    const nRightClick = async (el) => {
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        await sleep(200);
        
        // Find the interactive wrapper (often a button or parent div) rather than the raw img
        let targetEl = el.closest('button') || el.closest('[role="button"]') || el;
        highlightElement(targetEl);
        
        // Dispatch synthetic contextmenu event for React
        const rect = targetEl.getBoundingClientRect();
        const ev = new MouseEvent('contextmenu', {
            bubbles: true, cancelable: true, view: window,
            button: 2, buttons: 2,
            clientX: rect.left + (rect.width/2),
            clientY: rect.top + (rect.height/2)
        });
        targetEl.dispatchEvent(ev);
        
        await sleep(1000);
    };

    let generatedImageEl = null;

    if (startStep <= 1) {
        // STEP 1: New Project
    const newProjBtn = findElByText(['new project', 'create project', '+ new']);
    if (newProjBtn) {
        updateWidgetStatus('Opening Project...');
        await nClick(newProjBtn);
        await sleep(3000); // Wait for modal or page transition
    }

    // STEP 2: Name the project
    const allEl = getAllElements();
    const inputs = allEl.filter(el => (el.tagName === 'INPUT' && (el.type === 'text' || !el.type)) && isVisible(el));
    if (inputs.length > 0) {
        updateWidgetStatus('Naming project...');
        let counter = parseInt(localStorage.getItem('flow-proj-count') || '1');
        const projName = 'tes' + counter;
        localStorage.setItem('flow-proj-count', counter + 1);
        
        await nType(inputs[0], projName); // Type in the first visible input
        
        // Safely blur the input to force it to save
        try { inputs[0].blur(); } catch(e) {}
        await sleep(500);
    }

    // STEP 2.5: Wait for page to fully load
    updateWidgetStatus('Waiting for load...');
    let loaded = false;
    for (let i = 0; i < 60; i++) {
        await sleep(1000);
        if (findTextarea()) {
            loaded = true;
            break;
        }
    }
    
    // Give it 2 more seconds for buttons to render
    await sleep(2000); 

    if (applySettings) {
        updateWidgetStatus('Configuring 9:16...');
        const allEl2 = getAllElements();
        
        let settingsBtn = null;
        
        // First try aria-labels
        const gearIcons = allEl2.filter(el => {
            const label = (el.getAttribute('aria-label') || el.title || '').toLowerCase();
            return label.includes('setting') || label.includes('generation option');
        });
        settingsBtn = gearIcons.find(el => el.getBoundingClientRect().top > window.innerHeight / 2 && isVisible(el));
        
        // Fallback: find the slider icon next to the text area
        if (!settingsBtn) {
            const ta = findTextarea();
            if (ta) {
                const taRect = ta.getBoundingClientRect();
                let container = ta.parentElement;
                for (let i = 0; i < 8; i++) { // go up to 8 levels to handle deep React DOMs
                    if (!container) break;
                    // Get all interactive icons in this container that are vertically near the textarea
                    const btns = Array.from(container.querySelectorAll('button, [role="button"], .icon-button, svg')).filter(el => {
                        if (!isVisible(el)) return false;
                        const r = el.getBoundingClientRect();
                        return Math.abs(r.top - taRect.top) < 150; // Must be near the chat box
                    });
                    
                    // If there is a group of icons (usually on the right side)
                    if (btns.length >= 2) {
                        // Remove SVGs that are inside buttons to avoid double counting
                        const uniqueBtns = btns.filter(el => {
                            let parent = el.parentElement;
                            while (parent && parent !== container) {
                                if (btns.includes(parent)) return false;
                                parent = parent.parentElement;
                            }
                            return true;
                        });
                        
                        if (uniqueBtns.length >= 2) {
                            // The second to last one is the Sliders icon
                            settingsBtn = uniqueBtns[uniqueBtns.length - 2];
                            break;
                        }
                    }
                    container = container.parentElement;
                }
            }
        }

        if (settingsBtn) {
            updateWidgetStatus('Opening Settings...');
            await nClick(settingsBtn);
            await sleep(2500); // wait for modal fully
            
            // Find all "9:16" buttons in the modal and click them
            const modalEls = getAllElements();
            
            // Very aggressive fallback to find any 9:16 and x1
            for (const el of modalEls) {
                if (isVisible(el)) {
                    // Use innerText to avoid hidden SVG titles, and strip whitespace
                    const text = (el.innerText || el.textContent || '').replace(/\s+/g, '').trim().toLowerCase();
                    const rect = el.getBoundingClientRect();
                    
                    // If it exactly contains 9:16 and is a reasonable button size
                    if (text.includes('9:16') && text.length < 10 && rect.width < 350 && rect.width > 10) {
                        await nClick(el);
                    }
                    
                    // If it exactly contains x1
                    if (text === 'x1' && rect.width < 200 && rect.width > 10) {
                        await nClick(el);
                    }
                }
            }
            
            // Select Gemini Pro
            const currentNano = findElByText(['imagen', 'gemini', 'nano banana']);
            if (currentNano) {
                await nClick(currentNano); // Open dropdown
                await sleep(1500); // Wait longer for the dropdown animation!
                
                // Now the dropdown is open, find "Pro"
                const allDropdownEls = getAllElements();
                let proOptions = allDropdownEls.filter(el => {
                    if (!isVisible(el)) return false;
                    const text = (el.innerText || el.textContent || '').trim().toLowerCase();
                    const rect = el.getBoundingClientRect();
                    return (text.includes('gemini pro') || text.includes('gemini 1.5') || text.includes('imagen 3') || text.includes('nano banana pro')) && rect.height > 10 && rect.height < 100;
                });
                
                if (proOptions.length > 0) {
                    // Click the largest container (the full row) to ensure the click registers
                    proOptions.sort((a, b) => {
                        const rA = a.getBoundingClientRect();
                        const rB = b.getBoundingClientRect();
                        return (rB.width * rB.height) - (rA.width * rA.height);
                    });
                    await nClick(proOptions[0]);
                }
                await sleep(500);
            }

            // Check if "Never" is an option for Confirm before generating
            const neverText = findElByText(['never']);
            if (neverText) {
                await nClick(neverText);
                
                // The actual radio circle is to the left of the text! 
                // Since we don't know the exact pixel distance, we will BRUTE FORCE click a horizontal line to its left!
                const rect = neverText.getBoundingClientRect();
                const yPos = rect.top + (rect.height / 2);
                for (let offset = 10; offset <= 60; offset += 10) {
                    await new Promise(r => chrome.runtime.sendMessage({ 
                        action: 'nativeClick', 
                        rect: { x: rect.left - offset, y: yPos } 
                    }, r));
                    await sleep(100);
                }
                
                try { neverText.closest('label').click(); } catch(e) {}
            }

            // Click Save (ONLY look for 'save', do NOT look for 'confirm' to avoid matching descriptions)
            const saveBtn = findElByText(['save', 'apply']);
            if (saveBtn) {
                await nClick(saveBtn);
            }
            await sleep(1000); // wait for modal to close
        }
    }

    // STEP 4: Type Prompt
    let textarea = findTextarea();
    if (!textarea) {
        updateWidgetStatus('Prompt field not found');
        return { success: false };
    }
    
    async function attachFileToChat(file) {
        const dt = new DataTransfer();
        dt.items.add(file);
        
        let currentTa = findTextarea();
        if (currentTa) {
            try {
                // Focus the textarea physically before pasting
                await new Promise(r => chrome.runtime.sendMessage({ action: 'nativeClick', rect: getCenter(currentTa) }, r));
                await sleep(300);
            } catch(e) {}
            
            // Dispatch Paste event
            currentTa.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
        }
    }

    if (imageBase64) {
        updateWidgetStatus('Uploading media...');
        try {
            const base64Array = Array.isArray(imageBase64) ? imageBase64 : [imageBase64];
            const validBase64 = base64Array.filter(Boolean);
            
            if (validBase64.length > 0) {
                for (let i = 0; i < validBase64.length; i++) {
                    const res = await fetch(validBase64[i]);
                    let blob = await res.blob();
                    let mime = blob.type || 'image/jpeg';
                    let ext = mime.split('/')[1] || 'jpg';
                    
                    // Convert unsupported formats (like AVIF) to PNG
                    if (ext === 'avif' || mime.includes('avif')) {
                        updateWidgetStatus(`Converting AVIF to PNG...`);
                        blob = await new Promise((resolve) => {
                            const img = new Image();
                            img.onload = () => {
                                const canvas = document.createElement('canvas');
                                canvas.width = img.width;
                                canvas.height = img.height;
                                const ctx = canvas.getContext('2d');
                                ctx.drawImage(img, 0, 0);
                                canvas.toBlob(b => resolve(b), 'image/png');
                            };
                            img.onerror = () => resolve(blob); // fallback to original if error
                            img.src = validBase64[i];
                        });
                        mime = 'image/png';
                        ext = 'png';
                    } else {
                        // Fix common mime types
                        if (ext === 'jpeg') ext = 'jpg';
                        if (ext === 'svg+xml') ext = 'svg';
                    }
                    
                    const file = new File([blob], `reference_media_${i}.${ext}`, { type: mime });
                    
                    await attachFileToChat(file);
                    
                    // Wait for the UI to fully process and attach this image before pasting the next one!
                    for(let j=0; j<8; j++) {
                        updateWidgetStatus(`Uploading img ${i+1}/${validBase64.length} (${8-j}s)...`);
                        await sleep(1000);
                    }
                }
            }
        } catch (e) {
            console.error('Media upload failed:', e);
            updateWidgetStatus('Upload failed');
            await sleep(1000);
        }
        
        let newTextarea = findTextarea();
        if (newTextarea) {
            if (imgPrompt) {
                updateWidgetStatus('Typing image prompt...');
                const imagePromptStr = 'Generate a new image based on this uploaded reference image and the following prompt: ' + imgPrompt;
                await nType(newTextarea, imagePromptStr);
            } else if (vidPrompt) {
                updateWidgetStatus('Typing video prompt...');
                const videoPromptStr = 'Now create a high quality motion video using the image you just generated as a reference. The video should show: ' + vidPrompt;
                await nType(newTextarea, videoPromptStr);
            }
        } else {
            updateWidgetStatus('Lost textarea after upload');
            await sleep(2000);
        }
    } else {
        // Normal Text-to-Image Flow (no starting image)
        if (imgPrompt) {
            updateWidgetStatus('Typing image prompt...');
            const imagePromptStr = 'Generate an image of: ' + imgPrompt;
            await nType(textarea, imagePromptStr);
        } else if (vidPrompt) {
            updateWidgetStatus('Typing video prompt...');
            await nType(textarea, vidPrompt);
        }
    }
    
    // Wait a second to see if Enter triggered the generation
    await sleep(2000);
    
    // Fallback: If Enter didn't work, try to click the Send/Submit button
    const sendBtn = Array.from(document.querySelectorAll('button, [role="button"]')).find(el => {
        const label = (el.getAttribute('aria-label') || el.title || el.innerText || '').toLowerCase();
        return label.includes('send') || label.includes('submit');
    });
    if (sendBtn && isVisible(sendBtn)) {
        updateWidgetStatus('Clicking Send (Fallback)...');
        try { sendBtn.click(); } catch(e) {}
        await sleep(500);
        await new Promise(r => chrome.runtime.sendMessage({ action: 'nativeClick', rect: getCenter(sendBtn) }, r));
        await sleep(2000);
    }

        // Unified Wait Logic for Both Image and Video Generation
    const isVideoJob = !!vidPrompt;
    // 2 minutes (120s) for video, 30s for image as requested
    const waitSeconds = isVideoJob ? 120 : 30; 
    
    updateWidgetStatus(`Waiting ${waitSeconds}s for generation...`);
    
    for (let i = 0; i < waitSeconds; i++) {
        await sleep(1000);
        updateWidgetStatus(`Working... ${i}s / ${waitSeconds}s`);
        
        // At 5 seconds and 10 seconds, attempt fallback click just in case it didn't trigger initially
        if (i === 5 || i === 10) {
            let ta = findTextarea();
            if (ta) {
                try {
                    await new Promise(r => chrome.runtime.sendMessage({ action: 'nativeClick', rect: getCenter(ta) }, r));
                    await sleep(200);
                    await new Promise(r => chrome.runtime.sendMessage({ action: 'nativeType', prompt: '\r', rect: getCenter(ta) }, r));
                } catch(e) {}
            }
        }
    }

    let generationFinished = true;
    
    // Wait a solid 30 seconds buffer just to be absolutely sure the DOM has rendered the mp4
    for (let b = 30; b > 0; b -= 5) {
        updateWidgetStatus(`Buffer: ${b}s left...`);
        await sleep(5000);
    }

    let mediaBase64 = null;
    if (generationFinished) {
        updateWidgetStatus('Downloading generated media...');
        
        let leftPanelItems = [];
        for (let i = 0; i < 30; i++) {
            // Find gallery media
            leftPanelItems = Array.from(document.querySelectorAll('img, video')).filter(el => {
                const r = el.getBoundingClientRect();
                return isVisible(el) && r.width > 80 && r.height > 80 && r.left > 50 && r.left < window.innerWidth / 2;
            });
            if (leftPanelItems.length > 0) break;
            await sleep(1000);
        }
        
        leftPanelItems.sort((a, b) => (a.getBoundingClientRect().top * 10000 + a.getBoundingClientRect().left) - (b.getBoundingClientRect().top * 10000 + b.getBoundingClientRect().left));
        
        if (leftPanelItems.length === 0) {
            updateWidgetStatus('Error: Gallery media not found!', true);
            return { success: false, error: 'Gallery media not found' };
        }

        try {
            updateWidgetStatus('Extracting media...');
            const mediaEl = leftPanelItems[0];
            const mediaSrc = mediaEl.src || mediaEl.currentSrc;
            
            if (mediaSrc) {
                try {
                    const r = await fetch(mediaSrc);
                    const blob = await r.blob();
                    mediaBase64 = await new Promise(resolve => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                } catch(fetchErr) {
                    console.log('Fetch failed, falling back to canvas extraction...', fetchErr);
                    // Canvas fallback for images
                    if (mediaEl.tagName === 'IMG') {
                        const canvas = document.createElement('canvas');
                        canvas.width = mediaEl.naturalWidth || mediaEl.width || 1024;
                        canvas.height = mediaEl.naturalHeight || mediaEl.height || 1024;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(mediaEl, 0, 0, canvas.width, canvas.height);
                        mediaBase64 = canvas.toDataURL('image/png');
                    } else if (mediaEl.tagName === 'VIDEO') {
                        // Can't reliably extract full video via canvas, wait for the actual download to finish
                        // Alternatively, we could just upload the first frame, but the user expects the video.
                        // We will just let it fail gracefully for video if fetch fails.
                    }
                }
            }
        } catch(e) {
            console.error('Extraction failed completely', e);
        }

        try {
            await nRightClick(leftPanelItems[0]);
            let downBtn = findElByText(['download']);
            if (downBtn) {
                await nClick(downBtn);
                await sleep(1000); 
                
                // Strict Resolution Priority Hierarchy
                // 1. Highest Video (1080p)
                // 2. Highest Image (2k upscaled)
                // 3. Medium Video (720p, hd)
                // 4. Fallback (Original size)
                let qualityBtn = findElByText(['1080p', '1080']);
                
                if (!qualityBtn) qualityBtn = findElByText(['2k upscaled', '2k', 'upscaled']);
                if (!qualityBtn) qualityBtn = findElByText(['720p', '720', 'hd']);
                if (!qualityBtn) qualityBtn = findElByText(['original size', '1k']);

                if (qualityBtn) {
                    await nClick(qualityBtn);
                    updateWidgetStatus('Download started (with resolution)!');
                    await sleep(3000); // Give it a few seconds to trigger the download
                } else {
                    updateWidgetStatus('Download started (direct)!');
                    await sleep(3000);
                }
            } else {
                document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                await sleep(500);
                updateWidgetStatus('Error: Download missing!', true);
                return { success: false, error: 'Download missing' };
            }
        } catch(e) {
            updateWidgetStatus('Error: Right click crashed!', true);
            return { success: false, error: 'Right click crashed' };
        }
    }

    if (!generationFinished) {
        updateWidgetStatus('Error: Generation timed out!', true);
        return { success: false, error: 'Generation timed out after 15 minutes' };
    }

    // Explicitly STOP here. Do not continue or start a second generation.
    updateWidgetStatus('✅ Done! Automation stopped.');
    
    let isNativeDownload = true;
    return { success: true, mediaBase64, isNativeDownload };
    }
}

// === DIGEN AI AUTOMATION ===
async function runDigenAI(imgPrompt, autoClick, imageBase64) {
    updateWidgetStatus('Starting...');
    
    let textarea = findTextarea();
    if (!textarea) {
        updateWidgetStatus('Prompt field not found');
        return { success: false };
    }

    await uploadCustomImage();

    textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(500);
    highlightElement(textarea);
    
    await new Promise(r => chrome.runtime.sendMessage({ action: 'nativeType', prompt: imgPrompt, rect: getCenter(textarea) }, r));
    updateWidgetStatus('Prompt typed!');

    if (!autoClick) return { success: true };

    await sleep(2000);
    const btn = findGenerateButton();
    if (!btn) {
        updateWidgetStatus('Generate btn not found');
        return { success: false };
    }

    btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(500);
    highlightElement(btn);

    try { btn.click(); } catch (e) {}

    const clickSuccess = await new Promise(r => chrome.runtime.sendMessage({ action: 'nativeClick', rect: getCenter(btn) }, res => r(res && res.success)));
    if (!clickSuccess) {
        updateWidgetStatus('Automation click error');
        return { success: false };
    }

    updateWidgetStatus('Verifying generation...');
    const started = await verifyGenerationStarted();
    if (started) {
        updateWidgetStatus('Successfully Verified!');
        return { success: true };
    } else {
        updateWidgetStatus('Failed to start.');
        return { success: false };
    }
}

// === UNIVERSAL HELPERS ===
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function getAllElements(root = document) {
    let elements = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
    let node;
    while (node = walker.nextNode()) {
        elements.push(node);
        if (node.shadowRoot) {
            elements = elements.concat(getAllElements(node.shadowRoot));
        }
    }
    return elements;
}

function findElByText(keywords) {
    const all = getAllElements();
    let bestEl = null;
    let minArea = Infinity;
    for (const el of all) {
        if (!isVisible(el)) continue;
        
        // Exclude disabled elements (greyed out buttons like 1080p Upscaled for free users)
        if (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled')) continue;
        
        let isParentDisabled = false;
        let parent = el.parentElement;
        for (let j = 0; j < 3 && parent; j++) {
            if (parent.disabled || parent.getAttribute('aria-disabled') === 'true' || parent.classList.contains('disabled')) {
                isParentDisabled = true; break;
            }
            parent = parent.parentElement;
        }
        if (isParentDisabled) continue;

        const rect = el.getBoundingClientRect();
        if (rect.width > 600 || rect.height > 200) continue;
        
        // We only want the direct text of the element, not text from all its children
        // But textContent includes children. Since we penetrate the shadow DOM, we will find the innermost element anyway!
        const text = (el.textContent || '').trim().toLowerCase();
        
        // Check if text matches any keyword
        if (keywords.some(k => text === k || text.includes(k))) {
            const area = rect.width * rect.height;
            if (area > 0 && area < minArea) {
                minArea = area;
                bestEl = el;
            }
        }
    }
    if (bestEl) {
        const btn = bestEl.closest('button') || bestEl.closest('[role="button"]');
        return btn || bestEl;
    }
    return null;
}

async function uploadCustomImage() {
    updateWidgetStatus('Uploading image...');
    try {
        // Fetch the image from the extension
        const imgUrl = chrome.runtime.getURL('toy_car.jpg');
        const response = await fetch(imgUrl);
        const blob = await response.blob();
        const file = new File([blob], 'toy_car.jpg', { type: 'image/jpeg' });

        // 1. First try to find a file input and dispatch change event
        const allElements = getAllElements();
        const fileInput = allElements.find(el => el.tagName === 'INPUT' && el.type === 'file');
        if (fileInput) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            
            fileInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            await new Promise(r => setTimeout(r, 1000));
            updateWidgetStatus('Image uploaded!');
            return true;
        }

        // 2. If no input found, simulate a drag and drop on the upload area
        const dropZones = allElements.filter(el => {
            const text = el.textContent.toLowerCase();
            return text.includes('drag and drop') || text.includes('upload') || text.includes('drop image') || text.includes('add image');
        });

        if (dropZones.length > 0) {
            // Find the visible one
            const target = dropZones.find(isVisible) || dropZones[0];
            
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            
            ['dragenter', 'dragover', 'drop'].forEach(eventName => {
                const event = new DragEvent(eventName, {
                    bubbles: true,
                    cancelable: true,
                    dataTransfer: dataTransfer
                });
                target.dispatchEvent(event);
            });
            
            await new Promise(r => setTimeout(r, 1000));
            updateWidgetStatus('Image dropped!');
            return true;
        }
        
        updateWidgetStatus('Upload area not found');
        return false;
    } catch (e) {
        updateWidgetStatus('Failed to upload image');
        return false;
    }
}

function findTextarea() {
    const all = getAllElements();

    // 1. First look for contenteditable true
    for (const el of all) {
        if (el.getAttribute('contenteditable') === 'true' && isVisible(el)) return el;
    }

    // 2. Find all normal textareas and text inputs
    let textInputs = all.filter(el => (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el.type === 'text' || !el.type))) && isVisible(el));
    
    // Remove the global top search bar (usually has rect.top < 100)
    textInputs = textInputs.filter(el => el.getBoundingClientRect().top > 100);
    
    if (textInputs.length > 0) {
        // Return the bottom-most text input (which is usually the chat box)
        textInputs.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
        return textInputs[0];
    }
    
    // 3. Fallback: Find the "Video Prompt" header
    for (const el of all) {
        if (el.textContent === 'Video Prompt' && isVisible(el)) {
            let container = el.parentElement;
            while (container && container !== document.body) {
                const rect = container.getBoundingClientRect();
                if (rect.height > 100) return container;
                container = container.parentElement;
            }
        }
    }

    return null;
}

function findGenerateButton() {
    const all = document.querySelectorAll('*');
    let bestEl = null;
    let minArea = Infinity;

    for (const el of all) {
        if (!isVisible(el)) continue;
        
        // Ignore huge layout containers
        const rect = el.getBoundingClientRect();
        if (rect.width > 600 || rect.height > 200) continue;
        
        // Only text nodes directly or shallowly inside
        const text = el.textContent.trim().toLowerCase();
        
        // Avoid the top header 'Create' button
        if (text === 'create' && el.closest('nav, header, .header, [role="navigation"]')) continue;
        
        if (text.includes('generate') || text === 'create' || text === 'submit') {
            const area = rect.width * rect.height;
            // Find the smallest element (innermost text span) that contains the text
            if (area > 0 && area < minArea) {
                minArea = area;
                bestEl = el;
            }
        }
    }

    if (bestEl) {
        // If the innermost element is inside a semantic button, return the button.
        // Otherwise, returning the innermost text span is perfect, as clicking its center clicks the button!
        const btn = bestEl.closest('button') || bestEl.closest('[role="button"]');
        return btn || bestEl;
    }

    return null;
}

async function verifyGenerationStarted() {
    // Check if the state changed. Look for words like 'generating', 'progress', etc.
    // Or check if "No generation tasks" disappeared.
    for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 1000));
        
        const allText = document.body.textContent.toLowerCase();
        if (allText.includes('generating') || allText.includes('progress') || allText.includes('queued') || allText.includes('%')) {
            return true;
        }
        
        // If the generate button disappeared or became disabled, it started.
        const btn = findGenerateButton();
        if (!btn || btn.disabled) {
            return true;
        }
    }
    return false;
}

function highlightElement(el) {
    const orig = el.style.outline;
    el.style.outline = '4px solid #f43f5e';
    el.style.boxShadow = '0 0 20px #f43f5e';
    setTimeout(() => {
        el.style.outline = orig;
        el.style.boxShadow = '';
    }, 3000);
}

function isVisible(el) {
    if (!el) return false;
    const s = window.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
}

// Toasts removed per user request

