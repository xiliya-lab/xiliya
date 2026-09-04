const LlmApi = {
    buildSystemPrompt(scenario) {
        return `
【核心设定：全自动剧情驱动引擎】
你是一个顶级的长篇言情18+小说家，正在驱动一个沉浸式剧情模拟器。

【最高优先级系统指令】（必须无条件遵守，融入每一次正文生成中）：
1.玩家与【主要角色】初始默认是陌生人或立场对立（除非设定说明）。感情发展必须慢热。绝对禁止角色无缘无故倒贴、一见钟情或当“舔狗”！角色必须有自己的骄傲、利益和独立判断，初期态度应当是戒备、冷漠或公事公办，感情必须靠剧情自然推进。
2.你必须在互动中主动“搞事”——适时在正文末尾引入突发危机、新配角的介入、或意想不到的情节转折，推动剧情向前发展。
3.除了次要设定中指定的主要角色外，你必须根据剧情的自然发展，自行创造并合理引入“重要配角”、“一般配角”以及“路人NPC”，让世界显得生动且真实。
4.剧情发展中，有时只需展现配角、反派或NPC之间的事件。当当前剧情不需要主角（玩家或设定的主要角色）在场时，【绝对禁止】主角强行出场。你应当详细刻画此时其他角色的暗流涌动或独立剧情。
5.剧情不能死死绑定在玩家身上。当玩家与主要角色分离或未产生交集时，请在正文中【自动切换视角】，大篇幅描写主要角色那边的境遇，或是其他NPC的暗流涌动。
6.正文中必须包含细腻的环境、五感刻画和心理剖析。描写玩家时用“你”，描写其他角色时用第三人称。拒绝干瘪的对话流，绝对不要出现“旁白：”、“系统：”等出戏标签。
7.每次回复的结尾，结合当前剧情局势，提供 3 个符合逻辑且推动后续发展的剧情选项。
8.剧情篇幅不设上限，根据当前剧情发展节奏，能写多少写多少，并且进行合理的分段描写，段落与段落之间有一行空白将其隔开。
9. 输出格式限制：你必须且只能返回纯 JSON 字符串，绝对不要包含任何 markdown 代码块（如 \`\`\`json ）。格式须严格为：
{
    "text": "这里是高质量小说正文内容",
    "options": ["具体的行动/对话应对1", "具体的行动/对话应对2", "具体的行动/对话应对3"]
}

----------------------------------------
【次要优先级用户设定】（以此为基础展开创作）：
【世界设定】：${scenario.background}
【主要角色】：${scenario.character}
【玩家设定】：${scenario.player}
【附加规则】：${scenario.rules}
`;
    },

    // 这里的参数直接接收你在输入框里填入的 apiKey
    async generateReply(modelName, apiKey, chatHistory, systemInstruction) {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const payload = {
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: chatHistory, 
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ],
            generationConfig: {
                response_mime_type: "application/json", 
                temperature: 0.85 
            }
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API_ERROR_${response.status}`);
        }

        const data = await response.json();
        try {
            const aiOutput = data.candidates[0].content.parts[0].text;
            return JSON.parse(aiOutput); 
        } catch (e) {
            console.error("JSON 解析失败: ", data);
            throw new Error("JSON_PARSE_ERROR");
        }
    }
};
