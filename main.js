async function translate(text, from, to, options) {
    // 验证必要参数
    if (!text) {
        throw new Error("Translation text cannot be empty");
    }

    const {config, setResult, utils} = options;
    const {tauriFetch: fetch} = utils;

    // 参数处理与默认值设置
    function isFloatOrIntString(str) {
        return /^[+-]?\d*\.?\d+$/.test(str?.trim());
    }

    let {url, apiKey, model, temperature, stream, extra_model, system_prompt} = config;

    // 清理输入参数
    url = (url || '').trim();
    apiKey = (apiKey || '').trim();
    model = (model || '').trim();
    temperature = (temperature || '').trim();
    stream = true; // 强制使用流式输出
    extra_model = (extra_model || '').trim();
    system_prompt = (system_prompt || '').trim();

    if (!apiKey) {
        throw new Error("API key is required");
    }

    // 模型选择逻辑
    let model_name = extra_model || model || 'gpt-3.5-turbo';

    // URL处理
    if (!url) {
        url = "https://api.openai.com/v1/chat/completions";
    } else if (!url.endsWith("/v1/chat/completions")) {
        while (url.endsWith("/")) {
            url = url.slice(0, -1);
        }
        if (url.endsWith("/v1")) {
            url += "/chat/completions";
        } else {
            url += "/v1/chat/completions";
        }
    }

    // 参数验证与默认值
    let temp = 0.6;
    if (isFloatOrIntString(temperature)) {
        temp = parseFloat(temperature);
        if (temp < 0) temp = 0;
        if (temp > 2) temp = 2;
    }

    if (!system_prompt) {
        system_prompt = "You are a professional multilingual translation expert with deep knowledge of linguistics, cultural nuances, and technical terminology. Your goal is to provide accurate, natural, and context-aware translations across multiple languages.";
    }

    try {
        // 使用Text响应类型处理流式输出
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: {
                type: "Json",
                payload: {
                    model: model_name,
                    messages: [
                        {role: "system", content: system_prompt},
                        {
                            role: "user",
                            content: `Translate the following content into ${to}. Only return the translated content without explanations or additional notes:\n\n${text}`,
                        },
                    ],
                    temperature: temp,
                    stream: true
                }
            },
            // 关键修改：使用正确的响应类型枚举
            responseType: "Text"
        });

        if (!res.ok) {
            const errorData = await res.data.catch(() => "Unknown error");
            throw new Error(`API request failed (${res.status}): ${typeof errorData === 'object' ? JSON.stringify(errorData) : errorData}`);
        }

        // 处理文本响应
        const responseText = await res.data;

        // 手动解析SSE格式
        const lines = responseText.split("\n");
        let resultText = "";

        for (const line of lines) {
            if (line.trim() && line.startsWith('data:') && line !== 'data: [DONE]') {
                try {
                    const jsonStr = line.replace('data:', '').trim();
                    const json = JSON.parse(jsonStr);
                    // 提取增量内容
                    const content = json.choices[0]?.delta?.content || '';
                    if (content) {
                        resultText += content;
                        setResult(resultText);
                    }
                } catch (e) {
                    // 解析错误，忽略此行
                    console.warn("Failed to parse SSE line:", e.message);
                }
            }
        }

        return resultText;
    } catch (error) {
        // 错误处理
        const errorMessage = error.message || String(error);
        console.error("Translation error:", errorMessage);
        throw new Error(`Translation failed: ${errorMessage}`);
    }
}
