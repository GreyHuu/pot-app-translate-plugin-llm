async function translate(text, from, to, options) {
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

    if (extra_model.length === 0) {
        model = extra_model;
    }
    if (!url) {
        url = "https://api.openai.com/v1/chat/completions";
    } else if (!url.endsWith("/v1/chat/completions")) {
        // 删除URL末尾可能存在的斜杠，以便统一处理
        while (url.endsWith("/")) {
            url = url.slice(0, -1);
        }
        // 检查是否已经包含部分路径
        if (url.endsWith("/v1")) {
            url += "/chat/completions";
        } else {
            url += "/v1/chat/completions";
        }
    }
    if (!temperature) {
        temperature = 0.6
    }
    if (!system_prompt) {
        system_prompt = "You are a professional multilingual translation expert with deep knowledge of linguistics, cultural nuances, and technical terminology. Your goal is to provide accurate, natural, and context-aware translations across multiple languages."
    }

    stream = true

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },
        body: {
            type: "Json",
            payload: {
                model: model,
                messages: [
                    {role: "system", content: system_prompt},
                    {
                        role: "user",
                        content: `Translate the following content into ${to}:${text}`,
                    },
                ],
                temperature: temperature,
                stream: stream
            }
        }
    });

    // 流式输出处理
    if (!res.ok) {
        throw `Http Request Error\nHttp Status: ${res.status}\n${JSON.stringify(res.data)}`;
    }

    // 根据stream参数处理结果
    if (stream) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let resultText = "";

        try {
            while (true) {
                const {done, value} = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, {stream: true});
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.trim() && line.startsWith('data:') && line !== 'data: [DONE]') {
                        try {
                            const jsonStr = line.replace('data:', '').trim();
                            const json = JSON.parse(jsonStr);
                            const content = json.choices[0]?.delta?.content || '';
                            if (content) {
                                resultText += content;
                                // 使用 options 中的 setResult 函数更新结果
                                setResult(resultText);
                            }
                        } catch (e) {
                            // 解析错误，跳过此行
                        }
                    }
                }
            }
            return resultText
        } catch (error) {
            console.error("Stream reading error:", error);
            throw error;
        }
    } else {
        const data = await res.data;
        // 直接返回字符串结果
        return data.choices[0].message.content.trim().replace(/^"|"$/g, '');
    }
}
