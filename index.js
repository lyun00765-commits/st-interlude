/**
 * 插叙 · 小剧场
 *
 * 最小可用版本：
 *   写一句要什么场景 → 后台静默生成 → 预览/编辑 → 作为一条消息追加进当前聊天并保存。
 *
 * 三个关键的酒馆接口：
 *   SillyTavern.getContext()     拿全局状态（chat / saveChat / addOneMessage / extensionSettings）
 *   ctx.generateQuietPrompt()    在当前聊天上下文中后台生成，不渲染到 UI
 *   ctx.chat + ctx.saveChat()    读写当前聊天的消息数组并落盘
 */

const MODULE_NAME = 'interlude';

const DEFAULT_SETTINGS = {
    lastInstruction: '',
};

// ---------------------------------------------------------------- 设置

function getSettings() {
    const ctx = SillyTavern.getContext();
    if (!ctx.extensionSettings[MODULE_NAME]) {
        ctx.extensionSettings[MODULE_NAME] = structuredClone(DEFAULT_SETTINGS);
    }
    const store = ctx.extensionSettings[MODULE_NAME];
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (store[key] === undefined) store[key] = value;
    }
    return store;
}

function saveSettings() {
    SillyTavern.getContext().saveSettingsDebounced();
}

// ---------------------------------------------------------------- 界面

const PANEL_HTML = `
<div class="lt-panel">
    <label class="lt-hint">小剧场要写什么（在场人物 / 地点 / 想看到的事）</label>
    <textarea id="lt-instruction" placeholder="例：A 出门后，B 和 C 在客厅，B 想问 C 学校里的事，C 不想说"></textarea>
    <div class="lt-row">
        <button id="lt-generate" class="menu_button">生成小剧场</button>
        <span class="lt-hint" id="lt-status"></span>
    </div>
    <label class="lt-hint">生成结果（可以直接改，改完再写入）</label>
    <textarea id="lt-result" class="lt-result" placeholder="生成后出现在这里"></textarea>
    <div class="lt-row">
        <button id="lt-merge" class="menu_button">写入正文</button>
        <button id="lt-clear" class="menu_button">清空</button>
    </div>
    <p class="lt-hint">
        写入会作为一条新消息追加到当前聊天末尾并保存。不改动已有消息，随时可以手动删除。
    </p>
</div>
`;

function setStatus(text) {
    $('#lt-status').text(text || '');
}

function mountPanel() {
    if (document.getElementById('lt-instruction')) return;

    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'lt-settings';
    wrapper.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>插叙 · 小剧场</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">${PANEL_HTML}</div>
        </div>
    `;
    host.appendChild(wrapper);

    const settings = getSettings();
    $('#lt-instruction').val(settings.lastInstruction);

    $('#lt-instruction').on('input', () => {
        settings.lastInstruction = String($('#lt-instruction').val() || '');
        saveSettings();
    });

    $('#lt-generate').on('click', generate);
    $('#lt-merge').on('click', merge);
    $('#lt-clear').on('click', () => {
        $('#lt-result').val('');
        setStatus('');
    });
}

// ---------------------------------------------------------------- 生成

function buildPrompt(instruction) {
    return [
        '现在写一段独立的小剧场（插叙），用来补全正文里没有展开的旁支片段。',
        '',
        '要求：',
        '1. 只写这一段场景本身，不要承接、复述或推进当前正文的情节。',
        '2. 第三人称叙述，画面具体，一至三段。',
        '3. 只输出正文。不要标题、说明、字数统计、"（完）"或任何元信息。',
        '4. 不要出现"上文""与此同时，回到主线"之类的过渡语。',
        '',
        `本段内容：${instruction}`,
    ].join('\n');
}

async function resolveQuietPrompt() {
    const ctx = SillyTavern.getContext();
    if (typeof ctx.generateQuietPrompt === 'function') {
        return ctx.generateQuietPrompt.bind(ctx);
    }
    // 老版本 / 未挂到 context 时，从 script.js 直接取
    const module = await import('../../../../script.js');
    return module.generateQuietPrompt;
}

async function generate() {
    const ctx = SillyTavern.getContext();
    const instruction = String($('#lt-instruction').val() || '').trim();
    if (!instruction) {
        toastr.warning('先写一句要什么场景');
        return;
    }

    const $btn = $('#lt-generate');
    $btn.prop('disabled', true);
    setStatus('生成中…');

    try {
        const quietPrompt = await resolveQuietPrompt();
        const text = await quietPrompt({
            quietPrompt: buildPrompt(instruction),
            quietToLoud: false,
        });

        const cleaned = String(text || '').trim();
        if (!cleaned) {
            setStatus('');
            toastr.warning('模型返回了空内容');
            return;
        }

        $('#lt-result').val(cleaned);
        setStatus(`已生成 ${cleaned.length} 字，可先修改再写入`);
    } catch (error) {
        console.error('[小剧场] 生成失败', error);
        setStatus('');
        toastr.error(`生成失败：${error?.message || error}`);
    } finally {
        $btn.prop('disabled', false);
    }
}

// ---------------------------------------------------------------- 写入正文

function buildMessage(text) {
    return {
        name: '小剧场',
        is_user: false,
        is_system: false,
        send_date: Date.now(),
        mes: text,
        extra: {},
        swipes: [text],
        swipe_id: 0,
        swipe_info: [],
    };
}

async function appendToChat(message) {
    const ctx = SillyTavern.getContext();
    const before = ctx.chat.length;

    // addOneMessage 会插入并渲染；老版本可能不存在
    if (typeof ctx.addOneMessage === 'function') {
        try {
            await ctx.addOneMessage(message, { type: 'normal' });
        } catch (error) {
            console.warn('[小剧场] addOneMessage 失败，回退到手动写入', error);
        }
    }

    const added = ctx.chat.length - before;

    if (added === 0) {
        // 没插进去：手动 push 后重载聊天视图
        ctx.chat.push(message);
        if (typeof ctx.reloadCurrentChat === 'function') {
            await ctx.reloadCurrentChat();
        } else {
            toastr.info('已写入聊天记录，切一下聊天或刷新页面即可看到');
        }
    } else if (added > 1) {
        console.warn('[小剧场] 消息可能被重复插入，请检查聊天记录');
    }

    await ctx.saveChat();
}

async function merge() {
    const text = String($('#lt-result').val() || '').trim();
    if (!text) {
        toastr.warning('没有可写入的内容');
        return;
    }

    const $btn = $('#lt-merge');
    $btn.prop('disabled', true);

    try {
        await appendToChat(buildMessage(text));
        setStatus('已写入正文');
        toastr.success('小剧场已追加到当前聊天');
    } catch (error) {
        console.error('[小剧场] 写入失败', error);
        toastr.error(`写入失败：${error?.message || error}`);
    } finally {
        $btn.prop('disabled', false);
    }
}

// ---------------------------------------------------------------- 启动

function init() {
    try {
        mountPanel();
    } catch (error) {
        console.error('[小剧场] 面板挂载失败', error);
    }
}

jQuery(() => {
    const ctx = SillyTavern.getContext();
    if (ctx.eventSource && ctx.eventTypes) {
        ctx.eventSource.on(ctx.eventTypes.APP_READY, init);
    }
    // APP_READY 可能已经触发过，此时 DOM 里已经有设置面板
    if (document.getElementById('extensions_settings2')) init();
});
