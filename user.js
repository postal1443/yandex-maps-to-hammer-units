// ==UserScript==
// @name         Yandex Maps Hammer PRO v4.8 (Optimized)
// @namespace    http://postal1443.github.io
// @version      4.8.2
// @description  Оптимизированная версия: меньше нагрузки на CPU, чистый код. Исправлен баг "зеркального" угла. Конвертация в единицы Source (1м = 39.37hu).
// @author       Gemini & postal1443 (Refactored by AI)
// @match        https://yandex.ru/maps/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ================= КОНФИГУРАЦИЯ =================
    const CONFIG = {
        METERS_TO_UNITS: 39.37, // Источник: developer.valvesoftware.com/wiki/Map_Units
        GRID_VALUES: [0.125, 0.25, 0.5, 8, 16, 32, 64],
        ANGLE_VALUES: [0.25, 0.5, 11.25, 15, 22.5, 45, 90],
        CHECK_INTERVAL_MS: 150,
        COLORS: {
            primary: '#57ff68',
            bg: '#2a2a2a',
            border: '#57ff68',
            textDim: '#888',
            danger: '#b33939'
        }
    };

    let state = {
        grid: 16,
        angleStep: 15,
        showUnits: true,
        showAngle: true,
        isFullCircle: false,
        isVerticalRef: false,
        isActive: false
    };

    let activityTimeout;

    const STYLES = `
        #hammer-panel {
            position: fixed; top: 120px; left: 10px; z-index: 10000;
            background: ${CONFIG.COLORS.bg}; color: ${CONFIG.COLORS.primary};
            padding: 12px; border-radius: 8px; border: 1px solid ${CONFIG.COLORS.border};
            font-family: 'Consolas', 'Monaco', monospace;
            box-shadow: 0 4px 20px rgba(0,0,0,0.6); width: 160px; user-select: none;
            transition: opacity 0.2s;
        }
        #hammer-drag {
            font-size: 10px; color: ${CONFIG.COLORS.textDim}; text-align: center;
            margin-bottom: 10px; font-weight: bold; cursor: move;
            border-bottom: 1px solid #444; padding-bottom: 5px;
        }
        .hm-control { margin-bottom: 8px; }
        .hm-label { font-size: 10px; color: ${CONFIG.COLORS.textDim}; display: block; margin-bottom: 2px; }
        .hm-select {
            width: 100%; background: #333; color: ${CONFIG.COLORS.primary};
            border: 1px solid #444; border-radius: 4px; padding: 4px;
            font-size: 11px; cursor: pointer; outline: none;
        }
        .hm-row { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-top: 12px; }
        .hm-btn {
            background: #333; border-radius: 4px; text-align: center; cursor: pointer;
            font-size: 10px; border: 1px solid #444; padding: 4px; line-height: 1.2; transition: background 0.2s;
        }
        .hm-btn:hover { background: #444; }
        .hm-btn span { display: block; font-weight: bold; }
        .hm-reset {
            margin-top: 8px; background: ${CONFIG.COLORS.danger}; color: #fff;
            border-radius: 4px; text-align: center; cursor: pointer;
            font-size: 11px; padding: 6px; font-weight: bold; border: 1px solid #822727;
        }
        .hm-checkbox-row {
            margin-top: 12px; font-size: 11px; color: #ccc;
            display: flex; align-items: center; cursor: pointer; justify-content: space-between;
        }
        .h-res {
            color: ${CONFIG.COLORS.primary}; border-top: 1px dotted #555;
            margin-top: 3px; font-size: 11px; font-family: monospace;
        }
    `;

    function injectStyles() {
        if (!document.getElementById('hammer-styles')) {
            const styleSheet = document.createElement('style');
            styleSheet.id = 'hammer-styles';
            styleSheet.textContent = STYLES;
            document.head.appendChild(styleSheet);
        }
    }

    function autoConfirm(buttonTexts) {
        const start = Date.now();
        const check = () => {
            const confirmBtn = document.querySelector('.ruler-balloon__confirm .button, button[class*="confirm"]');
            if (confirmBtn && buttonTexts.some(t => confirmBtn.innerText.includes(t))) {
                confirmBtn.click();
            } else if (Date.now() - start < 2000) {
                requestAnimationFrame(check);
            }
        };
        requestAnimationFrame(check);
    }

    function hardReset() {
        document.querySelectorAll('.h-res').forEach(el => el.remove());
        const trashBtn = document.querySelector('.ruler-balloon__icon._type_trash');
        const closeBtn = document.querySelector('.ruler-balloon__icon._type_close');
        
        if (trashBtn) { 
            trashBtn.click(); 
            autoConfirm(['Удалить', 'все', 'Delete']); 
        } else if (closeBtn) { 
            closeBtn.click(); 
            autoConfirm(['Выключить', 'Close']); 
        }
    }

    function getXY(el) {
        if (!el) return { x: 0, y: 0 };
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    function calculateAngle() {
        const markers = Array.from(document.querySelectorAll('.ymaps3x0--marker')).filter(m => 
            m.classList.contains('ruler-view__point') || m.querySelector('.ruler-view__point')
        );
        
        const balloon = document.querySelector('.ruler-balloon');
        if (markers.length < 2 || !balloon) return null;

        const bRect = balloon.getBoundingClientRect();
        let endMarker = markers[markers.length - 1];
        let minDist = Infinity;

        markers.forEach(m => {
            const mRect = m.getBoundingClientRect();
            const dist = Math.hypot(mRect.left - bRect.left, mRect.top - bRect.top);
            if (dist < minDist) {
                minDist = dist;
                endMarker = m;
            }
        });

        const startMarker = markers.find(m => m !== endMarker) || markers[0];
        const p1 = getXY(startMarker);
        const p2 = getXY(endMarker);

        if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 2) return null;

        let dx = p2.x - p1.x;
        let dy = p1.y - p2.y;
        let angle;

        if (state.isFullCircle) {
            angle = Math.atan2(dy, dx) * 180 / Math.PI;
            if (state.isVerticalRef) angle -= 90;
            angle = (angle + 360) % 360;
        } else {
            if (state.isVerticalRef) {
                angle = Math.atan2(Math.abs(dx), Math.abs(dy));
            } else {
                angle = Math.atan2(Math.abs(dy), Math.abs(dx));
            }
            angle = angle * 180 / Math.PI;
        }

        return Math.round(angle / state.angleStep) * state.angleStep;
    }

    function updatePanelUI() {
        const panel = document.getElementById('hammer-panel');
        if (!panel) return;

        const gridSelect = panel.querySelector('#grid-select');
        const angleSelect = panel.querySelector('#angle-select');
        
        if (gridSelect && parseFloat(gridSelect.value) !== state.grid) gridSelect.value = state.grid;
        if (angleSelect && parseFloat(angleSelect.value) !== state.angleStep) angleSelect.value = state.angleStep;

        const modeText = panel.querySelector('#mode-text');
        const refText = panel.querySelector('#ref-text');
        
        if (modeText) {
            modeText.innerText = state.isFullCircle ? "0-360°" : "0-90°";
            modeText.style.color = state.isFullCircle ? "#00d4ff" : "#fff";
        }
        if (refText) {
            refText.innerText = state.isVerticalRef ? "VERT" : "HORIZ";
            refText.style.color = state.isVerticalRef ? "#ffa500" : "#fff";
        }
        
        const chkUnits = panel.querySelector('#t-u');
        const chkAngle = panel.querySelector('#t-a');
        if (chkUnits) chkUnits.checked = state.showUnits;
        if (chkAngle) chkAngle.checked = state.showAngle;
    }

    function processRuler() {
        if (!window.location.href.includes('maps')) return;
        
        const labels = document.querySelectorAll('.ruler-balloon__label');
        const angle = state.showAngle ? calculateAngle() : null;

        labels.forEach((label, i) => {
            const cleanText = label.innerText.replace(/\s+/g, '');
            const match = cleanText.match(/([\d,\.]+)(м|км)/i);
            
            if (match) {
                let meters = parseFloat(match[1].replace(',', '.'));
                if (match[2].toLowerCase() === 'км') meters *= 1000;

                let resDiv = label.querySelector('.h-res');
                if (!resDiv) {
                    resDiv = document.createElement('div');
                    resDiv.className = 'h-res';
                    label.appendChild(resDiv);
                }

                let outputParts = [];
                if (state.showUnits) {
                    const unitsVal = Math.round((meters * CONFIG.METERS_TO_UNITS) / state.grid) * state.grid;
                    outputParts.push(`📏 ${unitsVal}u`);
                }
                
                if (state.showAngle && i === labels.length - 1 && angle !== null) {
                    const icon = state.isFullCircle ? "🔄" : "📐";
                    outputParts.push(`${icon} ${angle}°`);
                }

                resDiv.innerHTML = outputParts.join('<br>');
                resDiv.style.display = outputParts.length ? 'block' : 'none';
            }
        });
    }

    function createPanel() {
        if (document.getElementById('hammer-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'hammer-panel';
        panel.innerHTML = `
            <div id="hammer-drag">HAMMER PRO v4.8.2</div>
            
            <div class="hm-control">
                <label class="hm-label">Grid:</label>
                <select id="grid-select" class="hm-select"></select>
            </div>
            
            <div class="hm-control">
                <label class="hm-label">Angle Step:</label>
                <select id="angle-select" class="hm-select"></select>
            </div>

            <div class="hm-row">
                <div id="mode-toggle" class="hm-btn">MODE<br><span id="mode-text">0-90°</span></div>
                <div id="ref-toggle" class="hm-btn">REF<br><span id="ref-text">HORIZ</span></div>
            </div>

            <div id="hard-reset" class="hm-reset">HARD RESET [CLS]</div>

            <div style="margin-top: 12px;">
                <label class="hm-checkbox-row">
                    <span>Units</span>
                    <input type="checkbox" id="t-u" checked>
                </label>
                <label class="hm-checkbox-row" style="margin-top:4px;">
                    <span>Angle</span>
                    <input type="checkbox" id="t-a" checked>
                </label>
            </div>
        `;

        document.body.appendChild(panel);

        const gridSelect = panel.querySelector('#grid-select');
        const angleSelect = panel.querySelector('#angle-select');

        CONFIG.GRID_VALUES.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            gridSelect.appendChild(opt);
        });

        CONFIG.ANGLE_VALUES.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v + '°';
            angleSelect.appendChild(opt);
        });

        let isDragging = false, offsetX, offsetY;
        const dragHandle = panel.querySelector('#hammer-drag');
        
        dragHandle.addEventListener('mousedown', (e) => {
            isDragging = true;
            offsetX = e.clientX - panel.offsetLeft;
            offsetY = e.clientY - panel.offsetTop;
            panel.style.cursor = 'grabbing';
            
            const onMove = (ev) => {
                if (!isDragging) return;
                panel.style.left = (ev.clientX - offsetX) + 'px';
                panel.style.top = (ev.clientY - offsetY) + 'px';
            };
            
            const onUp = () => {
                isDragging = false;
                panel.style.cursor = 'default';
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        panel.querySelector('#mode-toggle').onclick = () => { state.isFullCircle = !state.isFullCircle; updatePanelUI(); };
        panel.querySelector('#ref-toggle').onclick = () => { state.isVerticalRef = !state.isVerticalRef; updatePanelUI(); };
        panel.querySelector('#hard-reset').onclick = hardReset;
        panel.querySelector('#t-u').onchange = (e) => state.showUnits = e.target.checked;
        panel.querySelector('#t-a').onchange = (e) => state.showAngle = e.target.checked;

        updatePanelUI();
    }

    function init() {
        injectStyles();
        createPanel();

        const runLoop = () => {
            processRuler();
            if (state.isActive) {
                setTimeout(runLoop, 50);
            } else {
                setTimeout(runLoop, 300);
            }
        };
        
        runLoop();

        document.addEventListener('mousemove', () => {
            state.isActive = true;
            clearTimeout(activityTimeout);
            activityTimeout = setTimeout(() => {
                state.isActive = false;
            }, 500);
        });
        
        const observer = new MutationObserver(() => {
            state.isActive = true;
            clearTimeout(activityTimeout);
            activityTimeout = setTimeout(() => { state.isActive = false; }, 500);
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 1000);
    } else {
        window.addEventListener('load', () => setTimeout(init, 1000));
    }

})();