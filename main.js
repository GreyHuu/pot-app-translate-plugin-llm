async function translate(text, from, to, options) {
    const {config, setResult, utils} = options;
    const {tauriFetch} = utils;

    function isFloatOrIntString(str) {
        return /^[+-]?\d*\.?\d+$/.test(str?.trim());
    }

    let {url, apiKey, model, temperature, stream, extra_model, system_prompt} = config;

    // 清理输入参数
    url = (url || '').trim();
    apiKey = (apiKey || '').trim();
    model = (model || '').trim();
    temperature = (temperature || '').trim();
    stream = (stream || '').trim() === '是'; // 从config获取stream设置
    extra_model = (extra_model || '').trim();
    system_prompt = (system_prompt || '').trim();

    // 验证API密钥
    if (!apiKey) {
        throw new Error("API key is required");
    }

    // 模型选择逻辑
    let model_name = extra_model || model || 'gpt-4o';

    // URL处理
    if (!url) {
        url = "https://api.openai.com/v1/chat/completions";
    } else {
        // 确保URL格式正确
        if (!/https?:\/\/.+/.test(url)) {
            url = `https://${url}`;
        }

        // 处理API路径
        if (!url.endsWith("/v1/chat/completions")) {
            const apiUrl = new URL(url);
            if (apiUrl.pathname.endsWith('/')) {
                apiUrl.pathname += 'v1/chat/completions';
            } else if (apiUrl.pathname.endsWith('/v1')) {
                apiUrl.pathname += '/chat/completions';
            } else {
                apiUrl.pathname += '/v1/chat/completions';
            }
            url = apiUrl.href;
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
        system_prompt = "You are a professional multilingual translation expert. Translate accurately and naturally, maintaining the original meaning and style.";
    }

    // 构建请求参数
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    };

    const bodyData = {
        model: model_name,
        messages: [
            {role: "system", content: system_prompt},
            {role: "user", content: `Translate the following content into ${to}:\n"""\n${text}\n"""`},
        ],
        temperature: temp,
        stream: stream
    };

    try {
        // 根据stream参数选择处理方式
        if (stream) {
            // 流式处理 - 使用window.fetch
            const res = await window.fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(bodyData)
            });

            if (!res.ok) {
                const errorText = await res.text().catch(() => "Unknown error");
                throw `Http Request Error\nHttp Status: ${res.status}\n${errorText}`;
            }

            let target = '';
            const reader = res.body.getReader();
            let temp = ''; // 用于存储不完整的JSON

            try {
                while (true) {
                    const {done, value} = await reader.read();
                    if (done) {
                        setResult(target.trim());
                        return target.trim();
                    }

                    const str = new TextDecoder().decode(value);
                    let datas = str.split('data:');

                    for (let data of datas) {
                        if (data.trim() !== '' && data.trim() !== '[DONE]') {
                            try {
                                if (temp !== '') {
                                    // 合并前一个不完整的JSON
                                    data = temp + data.trim();
                                    let result = JSON.parse(data.trim());
                                    if (result.choices[0]?.delta?.content) {
                                        target += result.choices[0].delta.content;
                                        setResult(target);
                                    }
                                    temp = '';
                                } else {
                                    let result = JSON.parse(data.trim());
                                    if (result.choices[0]?.delta?.content) {
                                        target += result.choices[0].delta.content;
                                        setResult(target);
                                    }
                                }
                            } catch (e) {
                                // 保存不完整的JSON片段
                                temp = data.trim();
                            }
                        }
                    }
                }
            } finally {
                reader.releaseLock();
            }
        } else {
            // 非流式处理 - 使用tauriFetch
            const res = await tauriFetch(url, {
                method: "POST",
                headers: headers,
                body: {
                    type: "Json",
                    payload: bodyData
                }
            });

            if (!res.ok) {
                const errorData = await res.data.catch(() => "Unknown error");
                throw `Http Request Error\nHttp Status: ${res.status}\n${JSON.stringify(errorData)}`;
            }

            const data = await res.data;

            if (!data || !data.choices || !data.choices[0] || !data.choices[0].message) {
                throw new Error("Invalid response format from API");
            }

            let target = data.choices[0].message.content.trim();

            // 移除可能的引号
            if (target.startsWith('"')) {
                target = target.slice(1);
            }
            if (target.endsWith('"')) {
                target = target.slice(0, -1);
            }

            return target.trim();
        }
    } catch (error) {
        console.error("Translation error:", error);
        throw error;
    }
}
