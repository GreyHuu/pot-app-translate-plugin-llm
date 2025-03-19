async function translate(text, from, to, options) {
    function isFloatOrIntString(str) {
        return /^[+-]?\d*\.?\d+$/.test(str.trim());
    }

    const {config, setResult, utils} = options;
    const {tauriFetch: fetch} = utils;
    let {url, apiKey, model, temperature, stream, extra_model, system_prompt} = config;
    url = (url || '').trim()
    apiKey = (apiKey || '').trim()
    model = (model || '').trim()
    temperature = (temperature || '').trim()
    stream = (stream || '').trim()
    extra_model = (extra_model || '').trim()
    system_prompt = (system_prompt || '').trim()

    // 模型选择逻辑
    let model_name = extra_model || model || 'gpt-4o';

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
    // 构建请求参数
    const requestOptions = {
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
                stream: stream
            }
        },
        // 对流式响应使用文本类型
        ...(stream && {responseType: {type: "Text"}}),
        // 设置请求超时
        timeout: 60000
    };
    try {
        // 发送请求
        const res = await fetch(url, requestOptions);
        // 错误处理
        if (!res.ok) {
            const errorMessage = await res.text().catch(() => null);
            throw new Error(`API request failed (${res.status}): ${errorMessage || res.statusText}`);
        }
        // 处理流式响应
        if (stream) {
            // 检查是否有可用的流式读取API
            if (!res.body || !res.body.getReader) {
                throw new Error("Stream API not supported by Tauri fetch implementation");
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let resultText = "";
            let buffer = ""; // 用于存储跨块的不完整行
            try {
                while (true) {
                    const {done, value} = await reader.read();
                    if (done) break;
                    // 解码并与缓冲区合并
                    const chunk = decoder.decode(value, {stream: true});
                    buffer += chunk;

                    // 处理完整行
                    const lines = buffer.split('\n');
                    // 保留最后一个可能不完整的行
                    buffer = lines.pop() || "";
                    for (const line of lines) {
                        if (line.trim() && line.startsWith('data:') && line !== 'data: [DONE]') {
                            try {
                                const jsonStr = line.replace('data:', '').trim();
                                const json = JSON.parse(jsonStr);
                                const content = json.choices[0]?.delta?.content || '';
                                if (content) {
                                    resultText += content;
                                    setResult(resultText);
                                }
                            } catch (e) {
                                console.warn("Failed to parse SSE line:", line, e);
                            }
                        }
                    }
                }
                // 处理缓冲区中剩余的内容
                if (buffer && buffer.trim() && buffer.startsWith('data:') && buffer !== 'data: [DONE]') {
                    try {
                        const jsonStr = buffer.replace('data:', '').trim();
                        const json = JSON.parse(jsonStr);
                        const content = json.choices[0]?.delta?.content || '';
                        if (content) {
                            resultText += content;
                            setResult(resultText);
                        }
                    } catch (e) {
                        console.warn("Failed to parse final buffer:", buffer, e);
                    }
                }
                // 释放资源
                reader.releaseLock();

                return resultText;
            } catch (error) {
                // 确保出错时也释放资源
                reader.releaseLock();
                throw new Error(`Stream reading error: ${error.message || error}`);
            }
        } else {
            // 处理非流式响应
            const data = await res.data;
            if (!data || !data.choices || !data.choices[0] || !data.choices[0].message) {
                throw new Error("Invalid response format from API");
            }
            return data.choices[0].message.content.trim();
        }
    } catch (error) {
        // 统一错误处理
        const errorMessage = error.message || String(error);
        console.error("Translation error:", errorMessage);
        throw new Error(`Translation failed: ${errorMessage}`);
    }
}
