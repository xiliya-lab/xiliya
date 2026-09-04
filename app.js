/// --- 1. DOM 元素引用 ---
const domHub = document.getElementById('story-hub');
const domGame = document.getElementById('gameplay-view');
const domGameplayTitle = document.getElementById('gameplay-title');
const domChatContainer = document.getElementById('chat-container');
const domOptions = document.getElementById('options-layer');
const customReplyInput = document.getElementById('custom-reply-input');
const heartBtn = document.getElementById('btn-toggle-options');

const domSettingsModal = document.getElementById('modal-settings');
const domNewStoryModal = document.getElementById('modal-new-story');
const domApiLimitModal = document.getElementById('modal-api-limit');
const domSavesModal = document.getElementById('modal-saves');
const domSavesList = document.getElementById('saves-list');

const scenarioList = document.getElementById('scenario-list');
const apiKeySelect = document.getElementById('api-key-select');
const apiKeyDbInput = document.getElementById('api-key-db-input'); 
const modelInput = document.getElementById('model-input');

// --- 2. 状态变量 ---
let currentScenarioData = null; 
let chatHistory = [];           
let isAiGenerating = false; 
let currentPendingOptions = []; 
const sessionCache = {};        

let typingInterval = null; 
let isTyping = false;      

// --- 3. 动态生成密钥选项与初始化 ---
function generateApiKeyOptions() {
    for (let i = 1; i <= 30; i++) {
        const val = i.toString().padStart(4, '0');
        const opt = document.createElement('option');
        opt.value = val;
        opt.innerText = val;
        apiKeySelect.appendChild(opt);
    }
}

async function initApp() {
    try {
        generateApiKeyOptions();
        await dbManager.init();
        
        const apiKeyId = await dbManager.getSetting('api_key_id');
        const keyDbStr = await dbManager.getSetting('key_db_str');
        const model = await dbManager.getSetting('model');
        
        if (apiKeyId) apiKeySelect.value = apiKeyId;
        if (keyDbStr) apiKeyDbInput.value = keyDbStr;
        if (model) modelInput.value = model;

        await loadScenarios();
    } catch (error) {
        console.error("启动失败:", error);
    }
}

async function loadScenarios() {
    const scenarios = await dbManager.getAllScenarios();
    scenarioList.innerHTML = ''; 
    
    if (scenarios.length === 0) {
        scenarioList.innerHTML = '<p style="text-align:center; color:var(--text-secondary); margin-top: 2rem;">还没有剧情，点击右上角新建一个吧</p>';
        return;
    }

    scenarios.forEach(scenario => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <button class="card-edit-btn" onclick="openEditModal(${scenario.id}, event)">⋯</button>
            <h2>${scenario.title || '自定义剧情'}</h2>
            <p>角色: ${scenario.character ? scenario.character.substring(0, 10) + '...' : '未知'}</p>
            <button class="btn-primary" onclick="startCustomScenario(${scenario.id})">进入世界</button>
        `;
        scenarioList.appendChild(card);
    });
}

// --- 4. 大厅弹窗与设置事件 ---
document.querySelectorAll('.preset-tag').forEach(tag => tag.addEventListener('click', (e) => modelInput.value = e.target.innerText));
document.getElementById('btn-open-settings').addEventListener('click', () => domSettingsModal.classList.remove('hidden'));
document.getElementById('btn-open-new').addEventListener('click', () => domNewStoryModal.classList.remove('hidden'));

document.getElementById('btn-close-settings').addEventListener('click', async () => {
    await dbManager.saveSetting('api_key_id', apiKeySelect.value);
    await dbManager.saveSetting('key_db_str', apiKeyDbInput.value);
    await dbManager.saveSetting('model', modelInput.value);
    domSettingsModal.classList.add('hidden');
});

document.getElementById('btn-close-new').addEventListener('click', () => domNewStoryModal.classList.add('hidden'));
document.getElementById('btn-save-new').addEventListener('click', async () => {
    const storyName = document.getElementById('story-name').value.trim();
    await dbManager.saveScenario({
        title: storyName || "未命名剧情",
        background: document.getElementById('prompt-bg').value,
        character: document.getElementById('prompt-char').value,
        player: document.getElementById('prompt-player').value,
        rules: document.getElementById('prompt-rules').value,
        createdAt: new Date().getTime()
    });
    document.getElementById('story-name').value = '';
    document.querySelectorAll('#modal-new-story textarea').forEach(ta => ta.value = '');
    domNewStoryModal.classList.add('hidden');
    await loadScenarios();
});

// --- 5. 剧情页面 UI 操作 (气泡渲染) ---
function appendUserBubble(text) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble bubble-user';
    bubble.innerText = text;
    domChatContainer.appendChild(bubble);
    scrollToBottom();
}

function appendAiBubble(text, onComplete, isInstant = false) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble bubble-ai';
    domChatContainer.appendChild(bubble);
    
    if (isInstant) {
        bubble.innerText = text;
        if (onComplete) onComplete();
        return;
    }
    
    isTyping = true;
    let i = 0;
    clearInterval(typingInterval);
    
    scrollToBottom();
    
    typingInterval = setInterval(() => {
        bubble.innerText += text.charAt(i);
        i++;
        
        if (i >= text.length) {
            clearInterval(typingInterval);
            isTyping = false;
            if (onComplete) onComplete();
        }
    }, 40);
}

function showTypingIndicator() {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble bubble-ai typing-indicator';
    bubble.id = 'temp-typing';
    bubble.innerText = '对方正在思考...';
    domChatContainer.appendChild(bubble);
    scrollToBottom();
}

function removeTypingIndicator() {
    const indicator = document.getElementById('temp-typing');
    if (indicator) indicator.remove();
}

function renderOptions(optionsArray) {
    currentPendingOptions = optionsArray || [];
    domOptions.innerHTML = ''; 
    domOptions.classList.add('hidden'); 
    
    if (currentPendingOptions.length > 0) {
        heartBtn.classList.add('heart-active');
        currentPendingOptions.forEach(optText => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.innerText = optText;
            btn.addEventListener('click', () => {
                sendTurn(optText);
                domOptions.classList.add('hidden'); 
            });
            domOptions.appendChild(btn);
        });
    } else {
        heartBtn.classList.remove('heart-active');
    }
}

function scrollToBottom() {
    domChatContainer.scrollTop = domChatContainer.scrollHeight;
}

function saveSessionToCache() {
    if (currentScenarioData) {
        const sessionData = {
            history: chatHistory,
            options: currentPendingOptions
        };
        localStorage.setItem(`omni_session_${currentScenarioData.id}`, JSON.stringify(sessionData));
    }
}

// --- 6. 游戏流程控制与 API 接入 ---
window.startCustomScenario = async function(id) {
    const scenarios = await dbManager.getAllScenarios();
    currentScenarioData = scenarios.find(s => s.id === id);
    if (!currentScenarioData) return;
    checkAndLoadSession();
};

function checkAndLoadSession() {
    const savedSession = localStorage.getItem(`omni_session_${currentScenarioData.id}`);
    if (savedSession) {
        try {
            const sessionData = JSON.parse(savedSession);
            restoreGameplayState(sessionData);
        } catch(e) {
            initGameplayState();
        }
    } else {
        initGameplayState();
    }
}

function initGameplayState() {
    chatHistory = [];
    currentPendingOptions = [];
    domChatContainer.innerHTML = '';
    domOptions.innerHTML = '';
    domOptions.classList.add('hidden');
    heartBtn.classList.remove('heart-active');
    customReplyInput.value = '';
    domGameplayTitle.innerText = currentScenarioData.title;
    
    domHub.classList.remove('active');
    domGame.classList.add('active');
}

function restoreGameplayState(sessionData) {
    chatHistory = sessionData.history || [];
    domChatContainer.innerHTML = '';
    domOptions.innerHTML = '';
    domOptions.classList.add('hidden');
    customReplyInput.value = '';
    domGameplayTitle.innerText = currentScenarioData.title;

    chatHistory.forEach(msg => {
        if (msg.role === 'user') {
            appendUserBubble(msg.parts[0].text);
        } else if (msg.role === 'model') {
            try {
                const parsed = JSON.parse(msg.parts[0].text);
                appendAiBubble(parsed.text, null, true);
            } catch(e) {
                appendAiBubble(msg.parts[0].text, null, true);
            }
        }
    });

    renderOptions(sessionData.options || []);

    domHub.classList.remove('active');
    domGame.classList.add('active');
    setTimeout(scrollToBottom, 50);
}

document.getElementById('btn-exit-game').addEventListener('click', () => {
    domGame.classList.remove('active');
    domHub.classList.add('active');
});

heartBtn.addEventListener('click', () => {
    if (currentPendingOptions && currentPendingOptions.length > 0) {
        domOptions.classList.toggle('hidden');
        if (!domOptions.classList.contains('hidden')) {
            heartBtn.classList.remove('heart-active');
            setTimeout(scrollToBottom, 100);
        } else {
            heartBtn.classList.add('heart-active');
        }
    }
});

async function sendTurn(userText) {
    if (isAiGenerating || isTyping) return; 
    
    appendUserBubble(userText);
    chatHistory.push({ role: "user", parts: [{ text: userText }] });
    
    currentPendingOptions = []; 
    domOptions.classList.add('hidden'); 
    heartBtn.classList.remove('heart-active'); 
    saveSessionToCache();
    
    showTypingIndicator();
    isAiGenerating = true;

    try {
        const apiKeyId = await dbManager.getSetting('api_key_id');
        const keyDbStr = await dbManager.getSetting('key_db_str') || "";
        const modelName = await dbManager.getSetting('model');
        
        if (!modelName) throw new Error("请先在设置中选择或输入模型名称");

        let actualKey = null;
        // 核心修复：兼容不同系统的换行，并使用正则切割全角、半角等号及冒号
        const keyLines = keyDbStr.replace(/\r\n/g, '\n').split('\n');
        for (let line of keyLines) {
            const parts = line.split(/=|＝|:/);
            if (parts.length >= 2 && parts[0].trim() === apiKeyId) {
                // 将切出去的其余部分拼回来（以防密钥内部本身就带有等号）
                actualKey = parts.slice(1).join('=').trim();
                break;
            }
        }

        if (!actualKey) {
            throw new Error(`MISSING_KEY:${apiKeyId}`);
        }
        
        const sysPrompt = LlmApi.buildSystemPrompt(currentScenarioData);
        const responseJson = await LlmApi.generateReply(modelName, actualKey, chatHistory, sysPrompt);
        
        chatHistory.push({ role: "model", parts: [{ text: JSON.stringify(responseJson) }] });
        
        removeTypingIndicator();
        
        appendAiBubble(responseJson.text, () => {
            renderOptions(responseJson.options);
            saveSessionToCache(); 
            isAiGenerating = false; 
        });

    } catch (error) {
        console.error("生成失败原因:", error.message);
        
        chatHistory.pop(); 
        saveSessionToCache();
        removeTypingIndicator();
        
        if (domChatContainer.lastElementChild && domChatContainer.lastElementChild.classList.contains('bubble-user')) {
            domChatContainer.lastElementChild.remove();
        }
        
        customReplyInput.value = userText;

        // --- 核心修复：把 AI 背后的真实想法直接曝光给你看 ---
        if (error.message.includes("SAFETY_BLOCKED")) {
            appendAiBubble("【系统拦截】：剧情触碰了安全底线，AI 强制拒绝了回复。请稍微克制一下，修改回复后重试。", null, true);
        } else if (error.message.includes("MISSING_KEY")) {
            const missingId = error.message.split(":")[1];
            appendAiBubble(`【系统提示】：未在配置库找到编号 [${missingId}] 的真实密钥。`, null, true);
        } else if (error.message.includes("JSON_PARSE_ERROR")) {
            const rawText = error.message.substring(error.message.indexOf('|') + 1).trim();
            if (rawText && !rawText.includes("获取文本失败")) {
                appendAiBubble(`【系统拦截】：AI 脱离了剧本格式！这通常是因为剧情过激，AI 偷偷输出了委婉的拒绝语。\n\nAI 实际想对你说的原话是：\n「${rawText}」\n\n请修改你的输入后重新发送。`, null, true);
            } else {
                appendAiBubble("【系统提示】：AI 返回的数据格式严重损坏，请重试。", null, true);
            }
        } else if (error.message.includes("API_ERROR")) {
            let errInfo = error.message.replace('API_ERROR:', '').trim();
            if (errInfo.includes("high demand") || errInfo.includes("overloaded")) {
                appendAiBubble("【系统提示】：Google 官方服务器当前被挤爆了。请稍等十几秒后重新点击发送。", null, true);
            } else if (errInfo.includes("400")) {
                appendAiBubble(`【系统拦截】：通信失败 (400)。这是因为剧情露骨，Google 底层接口直接拔线了。请修改措辞（如采用拉灯描写）。`, null, true);
            } else {
                appendAiBubble(`【系统提示】：通信失败 (${errInfo})。可能是模型名不存在或 API 额度限制。`, null, true);
            }
        } else {
            appendAiBubble(`【系统提示】：未知错误 -> ${error.message}`, null, true);
        }
        
        isAiGenerating = false; 
    } 
}

document.getElementById('btn-send-reply').addEventListener('click', () => {
    const text = customReplyInput.value.trim();
    if (text) {
        sendTurn(text);
        customReplyInput.value = '';
    }
});

document.getElementById('btn-close-limit').addEventListener('click', () => domApiLimitModal.classList.add('hidden'));
document.getElementById('btn-to-settings-from-limit').addEventListener('click', () => {
    domApiLimitModal.classList.add('hidden');
    document.getElementById('modal-settings').classList.remove('hidden');
});

document.getElementById('btn-open-saves').addEventListener('click', async () => {
    domSavesModal.classList.remove('hidden');
    renderSavesList();
});
document.getElementById('btn-close-saves').addEventListener('click', () => domSavesModal.classList.add('hidden'));

document.getElementById('btn-create-save').addEventListener('click', async () => {
    if (chatHistory.length === 0) return alert("当前没有可保存的进度。");
    
    let summaryText = "新存档";
    const lastMsg = chatHistory[chatHistory.length - 1];
    if (lastMsg.role === 'user') summaryText = lastMsg.parts[0].text;
    else {
        try { summaryText = JSON.parse(lastMsg.parts[0].text).text.substring(0, 15) + '...'; } 
        catch(e) { summaryText = "系统记录"; }
    }

    const saveObj = {
        scenarioId: currentScenarioData.id,
        timestamp: new Date().getTime(),
        history: JSON.parse(JSON.stringify(chatHistory)), 
        summary: summaryText
    };

    await dbManager.saveGame(saveObj);
    renderSavesList();
});

async function renderSavesList() {
    domSavesList.innerHTML = '';
    const saves = await dbManager.getSavesByScenario(currentScenarioData.id);
    
    if (saves.length === 0) {
        domSavesList.innerHTML = '<p style="text-align:center; color:var(--text-secondary); margin-top:1rem;">暂无存档记录</p>';
        return;
    }

    saves.forEach(save => {
        const item = document.createElement('div');
        item.className = 'save-item';
        const dateStr = new Date(save.timestamp).toLocaleString();
        item.innerHTML = `
            <div class="save-date">${dateStr}</div>
            <div class="save-summary">${save.summary}</div>
        `;
        
        item.addEventListener('click', () => {
            if(confirm("确定要读取该档案吗？当前未保存的进度将会丢失。")) {
                loadArchive(save.history);
                domSavesModal.classList.add('hidden');
            }
        });
        domSavesList.appendChild(item);
    });
}

function loadArchive(savedHistory) {
    chatHistory = savedHistory;
    domChatContainer.innerHTML = ''; 
    domOptions.innerHTML = '';
    domOptions.classList.add('hidden');
    heartBtn.classList.remove('heart-active');

    let lastOptions = [];

    chatHistory.forEach(msg => {
        if (msg.role === 'user') {
            appendUserBubble(msg.parts[0].text);
        } else if (msg.role === 'model') {
            try {
                const parsed = JSON.parse(msg.parts[0].text);
                appendAiBubble(parsed.text, null, true);
                lastOptions = parsed.options || [];
            } catch(e) {
                appendAiBubble(msg.parts[0].text, null, true);
            }
        }
    });

    renderOptions(lastOptions);
    saveSessionToCache();
    
    domHub.classList.remove('active');
    domGame.classList.add('active');
}

// --- 编辑、删除剧情与重新开始逻辑 ---
window.openEditModal = async function(id, event) {
    event.stopPropagation(); 
    const scenarios = await dbManager.getAllScenarios();
    const scenario = scenarios.find(s => s.id === id);
    if (!scenario) return;

    document.getElementById('edit-story-id').value = scenario.id;
    document.getElementById('edit-story-name').value = scenario.title || "";
    document.getElementById('edit-prompt-bg').value = scenario.background || "";
    document.getElementById('edit-prompt-char').value = scenario.character || "";
    document.getElementById('edit-prompt-player').value = scenario.player || "";
    document.getElementById('edit-prompt-rules').value = scenario.rules || "";

    document.getElementById('modal-edit-story').classList.remove('hidden');
};

document.getElementById('btn-close-edit').addEventListener('click', () => {
    document.getElementById('modal-edit-story').classList.add('hidden');
});

document.getElementById('btn-update-story').addEventListener('click', async () => {
    const id = parseInt(document.getElementById('edit-story-id').value);
    await dbManager.updateScenario({
        id: id,
        title: document.getElementById('edit-story-name').value.trim() || "未命名剧情",
        background: document.getElementById('edit-prompt-bg').value,
        character: document.getElementById('edit-prompt-char').value,
        player: document.getElementById('edit-prompt-player').value,
        rules: document.getElementById('edit-prompt-rules').value,
        createdAt: new Date().getTime() 
    });
    
    document.getElementById('modal-edit-story').classList.add('hidden');
    await loadScenarios(); 
});

document.getElementById('btn-delete-story').addEventListener('click', async () => {
    if(confirm("确定要删除这个剧情吗？")) {
        const id = parseInt(document.getElementById('edit-story-id').value);
        await dbManager.deleteScenario(id);
        
        localStorage.removeItem(`omni_session_${id}`);
        
        document.getElementById('modal-edit-story').classList.add('hidden');
        await loadScenarios(); 
    }
});

document.getElementById('btn-restart-game').addEventListener('click', () => {
    if(confirm("确定要重新开始吗？当前未保存的进度将被完全清空。")) {
        localStorage.removeItem(`omni_session_${currentScenarioData.id}`);
        initGameplayState();
        domSavesModal.classList.add('hidden');
    }
});

// 启动执行
initApp();
