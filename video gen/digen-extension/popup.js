document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generateBtn');
    const resetBtn = document.getElementById('resetBtn');
    const imagePromptTextarea = document.getElementById('imagePrompt');
    const videoPromptTextarea = document.getElementById('videoPrompt');
    const statusDiv = document.getElementById('status');
    const autoClickCheckbox = document.getElementById('autoClickCheckbox');
    const presetButtons = document.querySelectorAll('.preset-btn');

    const defaultImg = 'A cute robot toy standing in a neon-lit room, high quality 3D render';
    const defaultVid = 'Walking and dancing, colorful LED lights flashing, smooth animation, playful movements, 4K quality';

    // Load saved prompt
    try {
        const savedImg = localStorage.getItem('digen-last-img');
        const savedVid = localStorage.getItem('digen-last-vid');
        if (savedImg) imagePromptTextarea.value = savedImg;
        if (savedVid) videoPromptTextarea.value = savedVid;
    } catch (e) {}

    // Preset buttons
    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            imagePromptTextarea.value = btn.dataset.img;
            videoPromptTextarea.value = btn.dataset.vid;
            showStatus('Preset loaded!', 'success');
        });
    });

    // Reset
    resetBtn.addEventListener('click', () => {
        imagePromptTextarea.value = defaultImg;
        videoPromptTextarea.value = defaultVid;
    });

    // Generate / Schedule
    generateBtn.addEventListener('click', async () => {
        const imgPrompt = imagePromptTextarea.value.trim();
        const vidPrompt = videoPromptTextarea.value.trim();
        if (!imgPrompt && !vidPrompt) {
            showStatus('Enter at least one prompt', 'error');
            return;
        }
        
        const scheduleTimeInput = document.getElementById('scheduleTime').value;
        const fileInput = document.getElementById('startImage');
        let imageBase64 = null;
        
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            if (file.size > 2 * 1024 * 1024) { // limit to 2MB to avoid storage quotas
                showStatus('Image must be under 2MB', 'error');
                return;
            }
            imageBase64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(file);
            });
        }

        try {
            localStorage.setItem('digen-last-img', imgPrompt);
            localStorage.setItem('digen-last-vid', vidPrompt);
        } catch (e) {}

        generateBtn.disabled = true;
        generateBtn.innerHTML = '<span>⏳</span> Processing...';
        const autoClick = autoClickCheckbox.checked;

        const reset = () => {
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<span>🚀</span> Run / Schedule';
        };

        try {
            if (scheduleTimeInput) {
                // Calculate timestamp for today at that time
                const now = new Date();
                const [hours, minutes] = scheduleTimeInput.split(':').map(Number);
                let targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
                
                if (targetDate.getTime() <= now.getTime()) {
                    targetDate.setDate(targetDate.getDate() + 1);
                }
                
                chrome.runtime.sendMessage({
                    action: 'schedule',
                    imagePrompt: imgPrompt,
                    videoPrompt: vidPrompt,
                    autoClick: autoClick,
                    image: imageBase64,
                    targetTime: targetDate.getTime()
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        showStatus('Error scheduling: ' + chrome.runtime.lastError.message, 'error');
                        reset();
                    } else {
                        showStatus(`Scheduled for ${targetDate.toLocaleTimeString()}!`, 'success');
                        setTimeout(() => window.close(), 3000);
                    }
                });
            } else {
                // Run immediately in current tab
                let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab) {
                    showStatus('No active tab found', 'error');
                    return reset();
                }
                
                // If they are stuck inside an old project, force them out!
                if (tab.url.includes('flow.google.com/project/')) {
                    showStatus('Starting a fresh project...', 'info');
                    await chrome.tabs.update(tab.id, { url: 'https://flow.google.com/u/1/' });
                    
                    // Wait for the page to navigate and load
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    
                    // Re-query the tab
                    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                    tab = tabs[0];
                }

                if (!tab.url || (!tab.url.includes('digen.ai') && !tab.url.includes('flow.google.com'))) {
                    showStatus('Please open Digen AI or Google Flow first', 'warning');
                    return reset();
                }

                chrome.tabs.sendMessage(
                    tab.id,
                    { action: 'fillPrompt', imagePrompt: imgPrompt, videoPrompt: vidPrompt, autoClick, image: imageBase64 },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            showStatus('Connection failed. Press F5 on the page!', 'error');
                        } else if (response && response.success) {
                            showStatus('✓ Started! Watch the page...', 'success');
                            setTimeout(() => window.close(), 2000);
                        } else {
                            showStatus('Something went wrong.', 'error');
                        }
                        reset();
                    }
                );
            }
        } catch (err) {
            showStatus('Error: ' + err.message, 'error');
            reset();
        }
    });

    function reset() {
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<span>⚡</span> Run / Schedule';
    }

    document.getElementById('test-dl').addEventListener('click', () => {
        showStatus('Testing Download & Attach (Step 2)...', 'info');
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (!activeTab || (!activeTab.url.includes('flow.google.com') && !activeTab.url.includes('digen.ai'))) {
                showStatus('Please open Google Flow first!', 'error');
                return;
            }
            chrome.tabs.sendMessage(activeTab.id, {
                action: 'fillPrompt',
                imagePrompt: imagePromptInput.value,
                videoPrompt: videoPromptInput.value,
                autoClick: autoClickCheckbox.checked,
                image: null,
                startStep: 2
            }, (response) => {
                if (chrome.runtime.lastError) {
                    showStatus('Make sure the page is loaded!', 'error');
                } else if (!response || !response.success) {
                    showStatus('Error starting test', 'error');
                }
            });
        });
    });

    document.getElementById('test-vid').addEventListener('click', () => {
        showStatus('Testing Video Prompt (Step 3)...', 'info');
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            chrome.tabs.sendMessage(activeTab.id, {
                action: 'fillPrompt',
                imagePrompt: imagePromptInput.value,
                videoPrompt: videoPromptInput.value,
                autoClick: autoClickCheckbox.checked,
                image: null,
                startStep: 3
            });
        });
    });

    function showStatus(msg, type) {
        statusDiv.textContent = msg;
        statusDiv.className = 'status ' + type;
        if (type === 'success' || type === 'info') {
            setTimeout(() => { statusDiv.className = 'status'; }, 3000);
        }
    }
});
