// ==UserScript==
// @name         Yandex Maps Hammer PRO v3.0 (Stable)
// @namespace    http://postal1443.github.io
// @version      3.0
// @description  Оптимизированный расчет 0-90°, фикс пробелов и стабильный Drag&Drop
// @author       Gemini & postal1443
// @match        https://yandex.ru/maps/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Проверка на дубликаты
    if (document.getElementById('hammer-panel')) return;

    let currentGrid = 16;
    let currentAngleStep = 15;
    let showUnits = true;
    let showAngle = true;
    const METERS_TO_UNITS = 39.37;

    // --- ИНТЕРФЕЙС ---
    const panel = document.createElement('div');
    panel.id = 'hammer-panel';
    panel.style = "position: fixed; top: 120px; left: 10px; z-index: 10000; background: #2a2a2a; color: #57ff68; padding: 12px; border-radius: 8px; border: 1px solid #57ff68; font-family: sans-serif; box-shadow: 0 4px 20px rgba(0,0,0,0.6); width: 150px; user-select: none;";

    panel.innerHTML = `
        <div id="hammer-drag" style="font-size: 10px; color: #888; text-align: center; margin-bottom: 10px; font-weight: bold; letter-spacing: 1px; cursor: move; border-bottom: 1px solid #444; padding-bottom: 5px;">HAMMER PRO v3.0</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;" id="g-btns"></div>
        <div style="margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 5px;" id="a-btns"></div>
        <div style="margin-top: 12px; font-size: 11px; color: #ccc;">
            <label style="display: flex; align-items: center; margin-bottom: 5px; cursor: pointer;"><input type="checkbox" id="t-u" checked style="margin-right: 8px;"> Units</label>
            <label style="display: flex; align-items: center; cursor: pointer;"><input type="checkbox" id="t-a" checked style="margin-right: 8px;"> Угол (0-90°)</label>
        </div>
    `;
    document.body.appendChild(panel);

    // --- СТАБИЛЬНЫЙ DRAG & DROP ---
    let isDragging = false, ox, oy;
    const head = panel.querySelector('#hammer-drag');

    const onMove = (e) => {
        if (!isDragging) return;
        panel.style.left = (e.clientX - ox) + 'px';
        panel.style.top = (e.clientY - oy) + 'px';
    };

    const onUp = () => {
        isDragging = false;
        head.style.color = '#888';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    };

    head.addEventListener('mousedown', (e) => {
        isDragging = true;
        ox = e.clientX - panel.offsetLeft;
        oy = e.clientY - panel.offsetTop;
        head.style.color = '#57ff68';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    // --- КНОПКИ ---
    const setupBtn = (cont, vals, isAngle) => {
        vals.forEach(v => {
            const b = document.createElement('button');
            b.innerText = v + (isAngle ? '°' : '');
            b.style = "background: #444; color: #ccc; border: none; padding: 5px; cursor: pointer; border-radius: 4px; font-size: 11px;";
            b.onclick = () => { if(isAngle) currentAngleStep = v; else currentGrid = v; updateUI(); };
            cont.appendChild(b);
        });
    };
    setupBtn(panel.querySelector('#g-btns'), [16, 32, 64, 128], false);
    setupBtn(panel.querySelector('#a-btns'), [5, 11.25, 15, 22.5], true);

    panel.querySelector('#t-u').onchange = (e) => showUnits = e.target.checked;
    panel.querySelector('#t-a').onchange = (e) => showAngle = e.target.checked;

    function updateUI() {
        panel.querySelectorAll('button').forEach(b => {
            const v = parseFloat(b.innerText);
            const active = v === currentGrid || v === currentAngleStep;
            b.style.background = active ? '#57ff68' : '#444';
            b.style.color = active ? '#000' : '#ccc';
        });
    }

    // --- РАСЧЕТЫ (0-90° MODE) ---
    function getXY(el) {
        const style = window.getComputedStyle(el);
        const matrix = new DOMMatrixReadOnly(style.transform);
        return { x: matrix.m41, y: matrix.m42 };
    }

    function calculateAngle() {
        const points = Array.from(document.querySelectorAll('.ymaps3x0--marker')).filter(m => m.querySelector('.ruler-view__point'));
        if (points.length < 2) return null;

        const p1 = getXY(points[points.length - 2]);
        const p2 = getXY(points[points.length - 1]);

        // Оставляем твою логику 0-90 (через Math.abs)
        const dx = Math.abs(p2.x - p1.x);
        const dy = Math.abs(p2.y - p1.y);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);

        return Math.round(angle / currentAngleStep) * currentAngleStep;
    }

    function process() {
        const balloons = document.querySelectorAll('.ruler-balloon__label');
        const angle = calculateAngle();

        balloons.forEach((label, i) => {
            // Исправленный парсинг (удаляем пробелы перед поиском цифр)
            const cleanText = label.innerText.replace(/\s+/g, '');
            const match = cleanText.match(/([\d,\.]+)(м|км)/);

            if (match) {
                let m = parseFloat(match[1].replace(',', '.'));
                if (match[2] === 'км') m *= 1000;
                const u = Math.round((m * METERS_TO_UNITS) / currentGrid) * currentGrid;

                let res = label.querySelector('.h-res');
                if (!res) {
                    res = document.createElement('div');
                    res.className = 'h-res';
                    res.style = "color: #57ff68; border-top: 1px dotted #555; margin-top: 3px; font-size: 11px; font-family: monospace;";
                    label.appendChild(res);
                }

                let out = [];
                if (showUnits) out.push(`📏 ${u}u`);
                if (showAngle && (i === balloons.length - 1) && angle !== null) out.push(`📐 ${angle}°`);

                res.innerHTML = out.join('<br>');
                res.style.display = out.length ? 'block' : 'none';
            }
        });
    }

    updateUI();
    setInterval(process, 250);
})();
