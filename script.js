// GitHub Pages cannot enumerate the /src directory at runtime.
// Keep this list in sync when adding new textbook JSON files.
const DATASET_FILES = [
    {
        id: "sougou-4",
        label: "综合日语 第四册",
        path: "./src/综合日语-第四册-单词.json",
    },
];

const FIXED_COLUMNS = [
    { label: "教材", getter: (record) => record.textbookLabel },
    { label: "课序", getter: (record) => record.lessonOrderText },
    { label: "课名", getter: (record) => record.lessonName },
    { label: "单元序", getter: (record) => record.unitOrderText },
    { label: "单元名", getter: (record) => record.unitName },
    { label: "词表类型", getter: (record) => record.vocabType },
];

const state = {
    textbooks: [],
    records: [],
    entryFieldKeys: [],
    view: "list",
    filters: {
        textbook: "all",
        lesson: "all",
        unit: "all",
        vocabType: "all",
    },
    pagination: {
        page: 1,
        pageSize: 20,
    },
    practice: createEmptyPracticeState(),
    loadErrors: [],
};

const dom = {};

document.addEventListener("DOMContentLoaded", () => {
    void init();
});

async function init() {
    cacheDom();
    bindEvents();
    renderLoadingState();
    await loadDatasets();
    render();
}

function cacheDom() {
    dom.datasetCount = document.getElementById("dataset-count");
    dom.totalCount = document.getElementById("total-count");
    dom.filteredCount = document.getElementById("filtered-count");
    dom.filterSummary = document.getElementById("filter-summary");
    dom.loadStatus = document.getElementById("load-status");
    dom.textbookSelect = document.getElementById("filter-textbook");
    dom.lessonSelect = document.getElementById("filter-lesson");
    dom.unitSelect = document.getElementById("filter-unit");
    dom.vocabTypeSelect = document.getElementById("filter-vocab-type");
    dom.viewButtons = Array.from(document.querySelectorAll(".view-button"));
    dom.listView = document.getElementById("view-list");
    dom.practiceView = document.getElementById("view-practice");
    dom.pageSize = document.getElementById("page-size");
    dom.listSummary = document.getElementById("list-summary");
    dom.tableHead = document.getElementById("table-head");
    dom.tableBody = document.getElementById("table-body");
    dom.pagePrev = document.getElementById("page-prev");
    dom.pageNext = document.getElementById("page-next");
    dom.pageMeta = document.getElementById("page-meta");
    dom.practiceStart = document.getElementById("practice-start");
    dom.practiceTotal = document.getElementById("practice-total");
    dom.practiceKnown = document.getElementById("practice-known");
    dom.practiceUnknown = document.getElementById("practice-unknown");
    dom.practiceRemaining = document.getElementById("practice-remaining");
    dom.practiceProgress = document.getElementById("practice-progress");
    dom.practiceStage = document.getElementById("practice-stage");
}

function bindEvents() {
    dom.textbookSelect.addEventListener("change", (event) => {
        state.filters.textbook = event.target.value;
        state.filters.lesson = "all";
        state.filters.unit = "all";
        state.pagination.page = 1;
        resetPracticeSession();
        render();
    });

    dom.lessonSelect.addEventListener("change", (event) => {
        state.filters.lesson = event.target.value;
        state.filters.unit = "all";
        state.pagination.page = 1;
        resetPracticeSession();
        render();
    });

    dom.unitSelect.addEventListener("change", (event) => {
        state.filters.unit = event.target.value;
        state.pagination.page = 1;
        resetPracticeSession();
        render();
    });

    dom.vocabTypeSelect.addEventListener("change", (event) => {
        state.filters.vocabType = event.target.value;
        state.pagination.page = 1;
        resetPracticeSession();
        render();
    });

    dom.viewButtons.forEach((button) => {
        button.addEventListener("click", () => {
            state.view = button.dataset.view;
            renderViewSwitch();
        });
    });

    dom.pageSize.addEventListener("change", (event) => {
        state.pagination.pageSize = Number(event.target.value) || 20;
        state.pagination.page = 1;
        render();
    });

    dom.pagePrev.addEventListener("click", () => {
        if (state.pagination.page > 1) {
            state.pagination.page -= 1;
            renderListView(getFilteredRecords());
        }
    });

    dom.pageNext.addEventListener("click", () => {
        const filtered = getFilteredRecords();
        const pageCount = Math.max(1, Math.ceil(filtered.length / state.pagination.pageSize));
        if (state.pagination.page < pageCount) {
            state.pagination.page += 1;
            renderListView(filtered);
        }
    });

    dom.practiceStart.addEventListener("click", () => {
        const filtered = getFilteredRecords();
        if (filtered.length === 0) {
            return;
        }
        startPractice(filtered);
        renderPracticeView(filtered);
    });
}

function renderLoadingState() {
    populateSelect(dom.textbookSelect, [], "加载中…", true, "all");
    populateSelect(dom.lessonSelect, [], "加载中…", true, "all");
    populateSelect(dom.unitSelect, [], "加载中…", true, "all");
    populateSelect(dom.vocabTypeSelect, [], "加载中…", true, "all");
    dom.filterSummary.textContent = "正在加载教材数据…";
    dom.listSummary.textContent = "正在读取词条…";
    dom.tableHead.innerHTML = "";
    dom.tableBody.innerHTML = `<tr><td class="empty-cell">正在加载词条数据…</td></tr>`;
    dom.practiceStage.innerHTML = renderPracticeMessage(
        "正在加载数据",
        "教材数据加载完成后，可以在这里开始本轮练习。"
    );
}

async function loadDatasets() {
    const results = await Promise.allSettled(
        DATASET_FILES.map((meta, index) => loadSingleDataset(meta, index))
    );

    const textbooks = [];
    const loadErrors = [];

    results.forEach((result) => {
        if (result.status === "fulfilled") {
            textbooks.push(result.value);
        } else {
            loadErrors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
        }
    });

    state.textbooks = textbooks;
    state.records = textbooks.flatMap((textbook) => textbook.records);
    state.entryFieldKeys = collectEntryFieldKeys(state.records);
    state.loadErrors = loadErrors;

    if (state.textbooks.length === 0) {
        state.loadErrors.push("没有成功加载任何教材 JSON，请检查 DATASET_FILES 配置和文件路径。");
    }
}

async function loadSingleDataset(meta, datasetIndex) {
    const response = await fetch(meta.path);

    if (!response.ok) {
        throw new Error(`教材加载失败：${meta.path}（HTTP ${response.status}）`);
    }

    const raw = await response.json();
    return normalizeDataset(raw, meta, datasetIndex);
}

function normalizeDataset(raw, meta, datasetIndex) {
    const textbookLabel = meta.label || inferTextbookLabel(raw, meta.path);
    const textbookId = meta.id || `textbook-${datasetIndex + 1}`;
    const lessons = Array.isArray(raw["课次"]) ? raw["课次"] : [];
    const records = [];

    lessons.forEach((lesson, lessonIndex) => {
        const lessonOrder = normalizeSequence(lesson["课序"], lessonIndex + 1);
        const lessonName = normalizeText(lesson["课名"], `第${lessonIndex + 1}课`);
        const units = Array.isArray(lesson["单元"]) ? lesson["单元"] : [];

        units.forEach((unit, unitIndex) => {
            const unitOrder = normalizeSequence(unit["单元序"], unitIndex + 1);
            const unitName = normalizeText(unit["单元名"], `单元${unitIndex + 1}`);
            const vocabBuckets = Array.isArray(unit["词表"]) ? unit["词表"] : [];

            vocabBuckets.forEach((bucket, bucketIndex) => {
                const vocabType = normalizeText(bucket["词表类型"], "未分类");
                const entries = Array.isArray(bucket["词条列表"]) ? bucket["词条列表"] : [];

                entries.forEach((entry, entryIndex) => {
                    const entryFields = sanitizeEntryFields(entry);
                    records.push({
                        id: [
                            textbookId,
                            lessonIndex + 1,
                            unitIndex + 1,
                            bucketIndex + 1,
                            entryIndex + 1,
                        ].join("::"),
                        textbookId,
                        textbookLabel,
                        datasetIndex,
                        sourcePath: meta.path,
                        lessonKey: `${textbookId}::lesson::${lessonIndex}`,
                        lessonIndex,
                        lessonOrderText: String(lessonOrder),
                        lessonName,
                        unitKey: `${textbookId}::lesson::${lessonIndex}::unit::${unitIndex}`,
                        unitIndex,
                        unitOrderText: String(unitOrder),
                        unitName,
                        vocabType,
                        bucketIndex,
                        entryIndex,
                        entryFields,
                    });
                });
            });
        });
    });

    return {
        id: textbookId,
        label: textbookLabel,
        path: meta.path,
        datasetIndex,
        records,
    };
}

function sanitizeEntryFields(entry) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return {};
    }

    return Object.entries(entry).reduce((accumulator, [key, value]) => {
        accumulator[String(key)] = value;
        return accumulator;
    }, {});
}

function inferTextbookLabel(raw, path) {
    const rawName = typeof raw["教材"] === "string" ? raw["教材"].trim() : "";
    if (rawName && rawName !== "单词.pdf") {
        return rawName;
    }

    const fileName = decodeURIComponent(path.split("/").pop() || path);
    return fileName.replace(/\.json$/i, "");
}

function collectEntryFieldKeys(records) {
    const seen = new Set();
    const keys = [];

    records.forEach((record) => {
        Object.keys(record.entryFields).forEach((key) => {
            if (!seen.has(key)) {
                seen.add(key);
                keys.push(key);
            }
        });
    });

    return keys;
}

function render() {
    syncFilterControls();
    const filteredRecords = getFilteredRecords();
    renderOverview(filteredRecords);
    renderLoadStatus();
    renderViewSwitch();
    renderListView(filteredRecords);
    renderPracticeView(filteredRecords);
}

function syncFilterControls() {
    const textbookOptions = state.textbooks
        .slice()
        .sort((a, b) => a.datasetIndex - b.datasetIndex)
        .map((textbook) => ({
            value: textbook.id,
            label: textbook.label,
        }));

    if (!isOptionValueAvailable(textbookOptions, state.filters.textbook) && state.filters.textbook !== "all") {
        state.filters.textbook = "all";
    }

    const lessonOptions = getLessonOptions();
    if (!isOptionValueAvailable(lessonOptions, state.filters.lesson) && state.filters.lesson !== "all") {
        state.filters.lesson = "all";
    }

    const unitOptions = getUnitOptions();
    if (!isOptionValueAvailable(unitOptions, state.filters.unit) && state.filters.unit !== "all") {
        state.filters.unit = "all";
    }

    const vocabTypeOptions = getVocabTypeOptions();
    if (
        !isOptionValueAvailable(vocabTypeOptions, state.filters.vocabType) &&
        state.filters.vocabType !== "all"
    ) {
        state.filters.vocabType = "all";
    }

    populateSelect(dom.textbookSelect, textbookOptions, "全部教材", state.textbooks.length === 0, state.filters.textbook);
    populateSelect(dom.lessonSelect, lessonOptions, "全部课次", lessonOptions.length === 0, state.filters.lesson);
    populateSelect(dom.unitSelect, unitOptions, "全部单元", unitOptions.length === 0, state.filters.unit);
    populateSelect(
        dom.vocabTypeSelect,
        vocabTypeOptions,
        "全部词表类型",
        vocabTypeOptions.length === 0,
        state.filters.vocabType
    );
}

function renderOverview(filteredRecords) {
    dom.datasetCount.textContent = String(state.textbooks.length);
    dom.totalCount.textContent = String(state.records.length);
    dom.filteredCount.textContent = String(filteredRecords.length);
    dom.filterSummary.textContent = describeCurrentFilters(filteredRecords.length);
}

function renderLoadStatus() {
    if (state.loadErrors.length === 0) {
        dom.loadStatus.hidden = true;
        dom.loadStatus.textContent = "";
        return;
    }

    dom.loadStatus.hidden = false;
    dom.loadStatus.textContent = state.loadErrors.join(" ");
}

function renderViewSwitch() {
    const isListView = state.view === "list";
    dom.listView.hidden = !isListView;
    dom.practiceView.hidden = isListView;

    dom.viewButtons.forEach((button) => {
        const isActive = button.dataset.view === state.view;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", String(isActive));
    });
}

function renderListView(filteredRecords) {
    const pageCount = Math.max(1, Math.ceil(filteredRecords.length / state.pagination.pageSize));
    if (state.pagination.page > pageCount) {
        state.pagination.page = pageCount;
    }

    const pageStartIndex = filteredRecords.length === 0 ? 0 : (state.pagination.page - 1) * state.pagination.pageSize;
    const pageRecords = filteredRecords.slice(pageStartIndex, pageStartIndex + state.pagination.pageSize);
    const rangeStart = filteredRecords.length === 0 ? 0 : pageStartIndex + 1;
    const rangeEnd = filteredRecords.length === 0 ? 0 : pageStartIndex + pageRecords.length;

    dom.listSummary.textContent =
        filteredRecords.length === 0
            ? "当前筛选范围没有词条。"
            : `当前共 ${filteredRecords.length} 条，显示第 ${rangeStart}-${rangeEnd} 条。`;

    renderTable(pageRecords);

    dom.pageMeta.textContent = `第 ${state.pagination.page} / ${pageCount} 页`;
    dom.pagePrev.disabled = state.pagination.page <= 1 || filteredRecords.length === 0;
    dom.pageNext.disabled = state.pagination.page >= pageCount || filteredRecords.length === 0;
}

function renderTable(records) {
    const columns = [
        ...FIXED_COLUMNS,
        ...state.entryFieldKeys.map((fieldKey) => ({
            label: fieldKey,
            getter: (record) => record.entryFields[fieldKey],
        })),
    ];

    dom.tableHead.innerHTML = `<tr>${columns
        .map((column) => `<th scope="col">${escapeHtml(column.label)}</th>`)
        .join("")}</tr>`;

    if (records.length === 0) {
        dom.tableBody.innerHTML = `<tr><td class="empty-cell" colspan="${columns.length}">当前范围没有词条。</td></tr>`;
        return;
    }

    dom.tableBody.innerHTML = records
        .map((record) => {
            const cells = columns
                .map((column) => `<td>${escapeHtml(formatValue(column.getter(record)))}</td>`)
                .join("");
            return `<tr>${cells}</tr>`;
        })
        .join("");
}

function renderPracticeView(filteredRecords) {
    const answers = state.practice.answers;
    const knownCount = answers.filter((answer) => answer.verdict === "known").length;
    const unknownCount = answers.filter((answer) => answer.verdict === "unknown").length;
    const practiceTotal = state.practice.started ? state.practice.items.length : filteredRecords.length;
    const remainingCount = state.practice.started
        ? Math.max(state.practice.items.length - answers.length, 0)
        : filteredRecords.length;

    dom.practiceStart.disabled = filteredRecords.length === 0;
    dom.practiceStart.textContent = state.practice.started ? "重新开始" : "开始本轮";
    dom.practiceTotal.textContent = `${practiceTotal} 条`;
    dom.practiceKnown.textContent = String(knownCount);
    dom.practiceUnknown.textContent = String(unknownCount);
    dom.practiceRemaining.textContent = String(remainingCount);
    dom.practiceProgress.style.width = `${getPracticeProgressPercent()}%`;

    if (filteredRecords.length === 0) {
        dom.practiceStage.innerHTML = renderPracticeMessage(
            "当前没有可练习的词条",
            "调整上方筛选条件后，再开始这一轮练习。"
        );
        return;
    }

    if (!state.practice.started) {
        dom.practiceStage.innerHTML = renderPracticeMessage(
            "准备开始本轮练习",
            `当前范围内共有 ${filteredRecords.length} 条词。点击“开始本轮”，按顺序逐条做自评。`
        );
        return;
    }

    if (state.practice.completed) {
        dom.practiceStage.innerHTML = renderPracticeSummary(
            state.practice.items.length,
            knownCount,
            unknownCount
        );
        return;
    }

    const currentRecord = state.practice.items[state.practice.index];
    dom.practiceStage.innerHTML = renderPracticeCard(
        currentRecord,
        state.practice.index + 1,
        state.practice.items.length
    );

    const knownButton = dom.practiceStage.querySelector("[data-practice-answer='known']");
    const unknownButton = dom.practiceStage.querySelector("[data-practice-answer='unknown']");

    knownButton.addEventListener("click", () => {
        recordPracticeAnswer("known");
    });

    unknownButton.addEventListener("click", () => {
        recordPracticeAnswer("unknown");
    });
}

function renderPracticeCard(record, currentIndex, total) {
    const scopeFields = [
        ["教材", record.textbookLabel],
        ["课序", record.lessonOrderText],
        ["课名", record.lessonName],
        ["单元序", record.unitOrderText],
        ["单元名", record.unitName],
        ["词表类型", record.vocabType],
    ];

    const term = record.entryFields["词条"] || "未命名词条";

    return `
        <article class="practice-card">
            <div class="practice-card-header">
                <div>
                    <p class="eyebrow">第 ${currentIndex} / ${total} 条</p>
                    <h3>${escapeHtml(formatValue(term))}</h3>
                </div>
                <div class="practice-pill-row">
                    <span class="practice-pill">${escapeHtml(record.textbookLabel)}</span>
                    <span class="practice-pill">第 ${escapeHtml(record.lessonOrderText)} 课</span>
                    <span class="practice-pill">单元 ${escapeHtml(record.unitOrderText)}</span>
                </div>
            </div>

            <div class="practice-grid">
                <section class="detail-card">
                    <h4>范围信息</h4>
                    ${renderDefinitionList(scopeFields)}
                </section>
                <section class="detail-card emphasis-card">
                    <h4>词条信息</h4>
                    ${renderDefinitionList(
                        state.entryFieldKeys.map((fieldKey) => [fieldKey, record.entryFields[fieldKey]])
                    )}
                </section>
            </div>

            <div class="practice-actions">
                <button class="secondary-button" type="button" data-practice-answer="unknown">不认识</button>
                <button class="primary-button" type="button" data-practice-answer="known">认识</button>
            </div>
        </article>
    `;
}

function renderPracticeSummary(total, knownCount, unknownCount) {
    return `
        <article class="practice-card summary-card">
            <div class="practice-card-header">
                <div>
                    <p class="eyebrow">Round Complete</p>
                    <h3>本轮练习结束</h3>
                </div>
            </div>
            <div class="summary-metrics">
                <div class="summary-metric">
                    <span>总数</span>
                    <strong>${escapeHtml(String(total))}</strong>
                </div>
                <div class="summary-metric">
                    <span>认识</span>
                    <strong>${escapeHtml(String(knownCount))}</strong>
                </div>
                <div class="summary-metric">
                    <span>不认识</span>
                    <strong>${escapeHtml(String(unknownCount))}</strong>
                </div>
            </div>
            <p class="summary-note">可以直接点击上方“重新开始”，按当前筛选范围再练一轮。</p>
        </article>
    `;
}

function renderPracticeMessage(title, body) {
    return `
        <article class="practice-card message-card">
            <div class="practice-card-header">
                <div>
                    <p class="eyebrow">Practice</p>
                    <h3>${escapeHtml(title)}</h3>
                </div>
            </div>
            <p class="summary-note">${escapeHtml(body)}</p>
        </article>
    `;
}

function renderDefinitionList(items) {
    return `
        <dl class="detail-list">
            ${items
                .map(
                    ([label, value]) =>
                        `<div class="detail-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(
                            formatValue(value)
                        )}</dd></div>`
                )
                .join("")}
        </dl>
    `;
}

function startPractice(records) {
    state.practice = {
        started: true,
        completed: false,
        items: [...records],
        index: 0,
        answers: [],
    };
}

function recordPracticeAnswer(verdict) {
    if (!state.practice.started || state.practice.completed) {
        return;
    }

    const currentRecord = state.practice.items[state.practice.index];
    state.practice.answers.push({
        id: currentRecord.id,
        verdict,
    });

    const hasNext = state.practice.index < state.practice.items.length - 1;
    if (hasNext) {
        state.practice.index += 1;
    } else {
        state.practice.completed = true;
    }

    renderPracticeView(getFilteredRecords());
}

function resetPracticeSession() {
    state.practice = createEmptyPracticeState();
}

function createEmptyPracticeState() {
    return {
        started: false,
        completed: false,
        items: [],
        index: 0,
        answers: [],
    };
}

function getFilteredRecords() {
    return state.records
        .filter((record) => matchesFilters(record, state.filters))
        .sort(compareRecords);
}

function matchesFilters(record, filters) {
    if (filters.textbook !== "all" && record.textbookId !== filters.textbook) {
        return false;
    }

    if (filters.lesson !== "all" && record.lessonKey !== filters.lesson) {
        return false;
    }

    if (filters.unit !== "all" && record.unitKey !== filters.unit) {
        return false;
    }

    if (filters.vocabType !== "all" && record.vocabType !== filters.vocabType) {
        return false;
    }

    return true;
}

function getLessonOptions() {
    const scopedRecords = state.records.filter((record) =>
        state.filters.textbook === "all" ? true : record.textbookId === state.filters.textbook
    );
    const includeTextbook = state.filters.textbook === "all";

    return uniqueOptions(scopedRecords, "lessonKey", (record) => ({
        value: record.lessonKey,
        label: includeTextbook
            ? `${record.textbookLabel} · 第${record.lessonOrderText}课 ${record.lessonName}`
            : `第${record.lessonOrderText}课 ${record.lessonName}`,
    }));
}

function getUnitOptions() {
    const scopedRecords = state.records.filter((record) => {
        if (state.filters.textbook !== "all" && record.textbookId !== state.filters.textbook) {
            return false;
        }
        if (state.filters.lesson !== "all" && record.lessonKey !== state.filters.lesson) {
            return false;
        }
        return true;
    });

    return uniqueOptions(scopedRecords, "unitKey", (record) => {
        const prefix = state.filters.textbook === "all" ? `${record.textbookLabel} · ` : "";
        const lesson = state.filters.lesson === "all" ? `第${record.lessonOrderText}课 · ` : "";
        return {
            value: record.unitKey,
            label: `${prefix}${lesson}单元${record.unitOrderText} ${record.unitName}`,
        };
    });
}

function getVocabTypeOptions() {
    const scopedRecords = state.records.filter((record) => {
        if (state.filters.textbook !== "all" && record.textbookId !== state.filters.textbook) {
            return false;
        }
        if (state.filters.lesson !== "all" && record.lessonKey !== state.filters.lesson) {
            return false;
        }
        if (state.filters.unit !== "all" && record.unitKey !== state.filters.unit) {
            return false;
        }
        return true;
    });

    return uniqueOptions(scopedRecords, "vocabType", (record) => ({
        value: record.vocabType,
        label: record.vocabType,
    }));
}

function uniqueOptions(records, key, mapRecordToOption) {
    const seen = new Set();
    const options = [];

    records.forEach((record) => {
        const value = record[key];
        if (seen.has(value)) {
            return;
        }

        seen.add(value);
        options.push(mapRecordToOption(record));
    });

    return options;
}

function populateSelect(select, options, allLabel, disabled, currentValue) {
    const renderedOptions = [
        `<option value="all">${escapeHtml(allLabel)}</option>`,
        ...options.map(
            (option) =>
                `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`
        ),
    ];

    select.innerHTML = renderedOptions.join("");
    select.disabled = disabled;
    select.value = currentValue;
}

function isOptionValueAvailable(options, value) {
    return options.some((option) => option.value === value);
}

function describeCurrentFilters(filteredCount) {
    const parts = [
        getSelectedTextbookLabel(),
        getSelectedLessonLabel(),
        getSelectedUnitLabel(),
        state.filters.vocabType === "all" ? "全部词表类型" : state.filters.vocabType,
    ];

    return `${parts.join(" / ")} · 共 ${filteredCount} 条`;
}

function getSelectedTextbookLabel() {
    if (state.filters.textbook === "all") {
        return "全部教材";
    }

    const textbook = state.textbooks.find((item) => item.id === state.filters.textbook);
    return textbook ? textbook.label : "全部教材";
}

function getSelectedLessonLabel() {
    if (state.filters.lesson === "all") {
        return "全部课次";
    }

    const option = getLessonOptions().find((item) => item.value === state.filters.lesson);
    return option ? option.label : "全部课次";
}

function getSelectedUnitLabel() {
    if (state.filters.unit === "all") {
        return "全部单元";
    }

    const option = getUnitOptions().find((item) => item.value === state.filters.unit);
    return option ? option.label : "全部单元";
}

function getPracticeProgressPercent() {
    if (!state.practice.started || state.practice.items.length === 0) {
        return 0;
    }

    if (state.practice.completed) {
        return 100;
    }

    return Math.round((state.practice.answers.length / state.practice.items.length) * 100);
}

function compareRecords(left, right) {
    return (
        left.datasetIndex - right.datasetIndex ||
        left.lessonIndex - right.lessonIndex ||
        left.unitIndex - right.unitIndex ||
        left.bucketIndex - right.bucketIndex ||
        left.entryIndex - right.entryIndex
    );
}

function normalizeText(value, fallback) {
    if (typeof value === "string" && value.trim()) {
        return value.trim();
    }
    return fallback;
}

function normalizeSequence(value, fallback) {
    if (value === null || value === undefined || value === "") {
        return fallback;
    }
    return value;
}

function formatValue(value) {
    if (value === null || value === undefined || value === "") {
        return "—";
    }

    if (Array.isArray(value)) {
        return value.map((item) => formatValue(item)).join(" / ");
    }

    if (typeof value === "object") {
        return JSON.stringify(value);
    }

    return String(value);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
